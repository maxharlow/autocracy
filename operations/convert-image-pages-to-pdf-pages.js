import OS from 'os'
import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'
import Tesseract from 'tesseract.js'

async function initialise(origin, destination, options = { method: 'shell', language: 'eng', density: 300 }, verbose, alert) {

    async function converterShell() {
        const isInstalled = await Lookpath.lookpath('tesseract')
        if (!isInstalled) throw new Error('Tesseract not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `OMP_THREAD_LIMIT=1 tesseract -l ${options.language} --dpi ${options.density} --psm 11 "${item.input}" - pdf`
            const result = await execute(command, { encoding: 'binary', maxBuffer: 2 * 1024 * 1024 * 1024 }) // 2GB
            return Buffer.from(result.stdout, 'binary')
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
            return Buffer.from(output.data)
        }
        return {
            run,
            terminate: scheduler.terminate
        }
    }

    async function write(item) {
        if (item.skip) return item
        await FSExtra.writeFile(item.output, item.data)
        if (verbose) alert({
            operation: 'convert-image-pages-to-pdf-pages',
            input: item.input,
            output: item.output,
            message: 'done'
        })
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const converters = {
            shell: converterShell,
            library: converterLibrary
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
                const data = await converter.run(item)
                return { ...item, data }
            }
            catch (e) {
                alert({
                    operation: 'convert-image-pages-to-pdf-pages',
                    input: item.input,
                    output: item.output,
                    message: e.message
                })
                return { ...item, skip: true } // failed with error
            }
        }
        const sourceGenerator = () => Globby.globbyStream(options.originInitial || origin, {
            objectMode: true,
            onlyFiles: false,
            deep: 1
        })
        const source = () => Scramjet.DataStream.from(sourceGenerator()).flatMap(async file => {
            const pages = await Globby.globby(`${origin}/${file.name}/*`, { objectMode: true })
            return pages.map(pagefile => {
                return {
                    name: file.name,
                    input: `${origin}/${file.name}/${pagefile.name}`,
                    output: `${destination}/${file.name}/${pagefile.name.replace(/png$/, 'pdf')}`
                }
            })
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().unorder(convert).unorder(write)
        return { run, length, terminate: converter.terminate }
    }

    return setup()

}

export default initialise
