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
            const command = `OMP_THREAD_LIMIT=1 tesseract -l ${options.language} --dpi ${options.density} --psm 11 "${origin}/${item.name}/${item.pagefile}" - pdf`
            if (verbose) alert(command)
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
        if (verbose) alert('Tesseract worker setup complete')
        const run = async item => {
            await scheduler.addJob('recognize', `${origin}/${item.name}/${item.pagefile}`)
            const output = await scheduler.addJob('getPDF', `${origin}/${item.name}/${item.pagefile}`)
            return Buffer.from(output.data)
        }
        return {
            run,
            terminate: scheduler.terminate
        }
    }

    async function write(item) {
        if (item.skip) return item
        await FSExtra.writeFile(`${destination}/${item.name}/${item.pagefile.replace(/png$/, 'pdf')}`, item.data)
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
            const outputExists = await FSExtra.exists(`${destination}/${item.name}/${item.pagefile.replace(/jpeg$/, 'pdf')}`)
            if (outputExists) return { item, skip: true } // already exists, skip
            const inputExists = await FSExtra.exists(`${origin}/${item.name}`)
            if (!inputExists) return { item, skip: true } // no input, skip
            await FSExtra.ensureDir(`${destination}/${item.name}`)
            try {
                const data = await converter.run(item)
                return { ...item, data }
            }
            catch (e) {
                console.error(`Error: ${e.message} (retrying...)`)
                await FSExtra.remove(`${destination}/${item.name}`) // so we don't trigger the exists check and skip
                if (verbose) console.error(e.stack)
                return convert(item)
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
                    pagefile: pagefile.name
                }
            })
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().map(convert).map(write)
        return { run, length, terminate: converter.terminate }
    }

    return setup()

}

export default initialise
