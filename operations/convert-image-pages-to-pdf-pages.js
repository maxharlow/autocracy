import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'

async function initialise(origin, destination, options = { method: 'shell', language: 'eng', density: 300 }, verbose, alert) {

    async function converterShell() {
        const isInstalled = await Lookpath.lookpath('tesseract')
        if (!isInstalled) throw new Error('Tesseract not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `OMP_THREAD_LIMIT=1 tesseract -l ${options.language} --dpi ${options.density} --psm 11 "${origin}/${item.root}/${item.pagefile}" - pdf`
            if (verbose) alert(command)
            const result = await execute(command, { encoding: 'binary', maxBuffer: 2 * 1024 * 1024 * 1024 }) // 2GB
            return Buffer.from(result.stdout, 'binary')
        }
        return {
            run,
            terminate: () => {} // for consistency
        }
    }

    async function write(item) {
        if (item.skip) return item
        await FSExtra.writeFile(`${destination}/${item.root}/${item.pagefile.replace(/png$/, 'pdf')}`, item.data)
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const converters = {
            shell: converterShell
        }
        const converter = await converters[options.method]()
        const convert = async item => {
            const outputExists = await FSExtra.exists(`${destination}/${item.root}/${item.pagefile.replace(/jpeg$/, 'pdf')}`)
            if (outputExists) return { item, skip: true } // already exists, skip
            const inputExists = await FSExtra.exists(`${origin}/${item.root}`)
            if (!inputExists) return { item, skip: true } // no input, skip
            await FSExtra.ensureDir(`${destination}/${item.root}`)
            try {
                const data = await converter.run(item)
                return { ...item, data }
            }
            catch (e) {
                console.error(`Error: ${e.message} (retrying...)`)
                await FSExtra.remove(`${destination}/${item.root}`) // so we don't trigger the exists check and skip
                if (verbose) console.error(e.stack)
                return convert(item)
            }
        }
        const sourceGenerator = () => Globby.globbyStream(options.originInitial || origin, {
            objectMode: true,
            deep: 1
        })
        const source = () => Scramjet.DataStream.from(sourceGenerator()).flatMap(async file => {
            const pages = await Globby.globby(`${origin}/${file.name}/*`, { objectMode: true })
            return pages.map(pagefile => {
                return {
                    root: file.name,
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
