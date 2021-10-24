import OS from 'os'
import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import Lookpath from 'lookpath'
import Tempy from 'tempy'
import ChildProcess from 'child_process'
import Tesseract from 'tesseract.js'

async function initialise(origin, destination, options = { method: 'shell', language: 'eng', density: 300 }, verbose, alert) {

    async function converterShell() {
        const isInstalled = await Lookpath.lookpath('tesseract')
        if (!isInstalled) throw new Error('Tesseract not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const output = Tempy.file()
            const command = `OMP_THREAD_LIMIT=1 tesseract -l ${options.language} --dpi ${options.density} --psm 11 "${item.input}" ${output} pdf`
            try {
                await execute(command)
                await FSExtra.move(`${output}.pdf`, item.output)
            }
            catch (e) {
                const message = e.message.trim().split('\n').pop()
                throw new Error(message)
            }
        }
        return {
            run,
            terminate: () => {} // for consistency
        }
    }

    async function converterLibrary() {
        const scheduler = Tesseract.createScheduler()
        await Array.from({ length: OS.cpus().length }).reduce(async previous => {
            await previous
            const worker = Tesseract.createWorker()
            await worker.load()
            await worker.loadLanguage(options.language)
            await worker.initialize(options.language)
            await worker.setParameters({
                tessjs_create_hocr: false,
                tessjs_create_tsv: false,
                user_defined_dpi: options.density,
                tessedit_pageseg_mode: Tesseract.PSM.PSM_SPARSE_TEXT
            })
            scheduler.addWorker(worker)
        }, Promise.resolve())
        const run = async item => {
            await scheduler.addJob('recognize', item.input)
            const output = await scheduler.addJob('getPDF', item.input)
            const data = Buffer.from(output.data)
            await FSExtra.writeFile(item.output, data)
        }
        return {
            run,
            terminate: scheduler.terminate
        }
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const converters = {
            library: converterLibrary, // much slower
            shell: converterShell
        }
        const converter = await converters[options.method]()
        const convert = async item => {
            const outputExists = await FSExtra.exists(item.output)
            if (outputExists) {
                if (verbose) alert({
                    operation: 'convert-image-pages-to-pdf-pages',
                    input: item.input,
                    output: item.output,
                    message: 'output exists'
                })
                return { ...item, skip: true } // already exists, skip
            }
            const inputExists = await FSExtra.exists(item.input)
            if (!inputExists) {
                if (verbose) alert({
                    operation: 'convert-image-pages-to-pdf-pages',
                    input: item.input,
                    output: item.output,
                    message: 'no input'
                })
                return { ...item, skip: true } // no input, skip
            }
            await FSExtra.ensureDir(`${destination}/${item.name}`)
            if (verbose) alert({
                operation: 'convert-image-pages-to-pdf-pages',
                input: item.input,
                output: item.output,
                message: 'converting...'
            })
            try {
                await converter.run(item)
                if (verbose) alert({
                    operation: 'convert-image-pages-to-pdf-pages',
                    input: item.input,
                    output: item.output,
                    message: 'done'
                })
                return item
            }
            catch (e) {
                alert({
                    operation: 'convert-image-pages-to-pdf-pages',
                    input: item.input,
                    output: item.output,
                    message: e.message,
                    isError: true
                })
                return { ...item, skip: true } // failed with error
            }
        }
        const source = () => {
            const listing = FSExtra.opendir(options.originInitial || origin)
            return Scramjet.DataStream.from(listing).flatMap(async file => {
                const exists = await FSExtra.exists(`${origin}/${file.name}`)
                if (!exists) return []
                const pages = await FSExtra.readdir(`${origin}/${file.name}`)
                return pages.map(page => {
                    return {
                        name: file.name,
                        input: `${origin}/${file.name}/${page}`,
                        output: `${destination}/${file.name}/${page.replace(/png$/, 'pdf')}`
                    }
                })
            })
        }
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().setOptions({ maxParallel: OS.cpus().length }).unorder(convert)
        return { run, length, terminate: converter.terminate }
    }

    return setup()

}

export default initialise
