import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'

async function initialise(origin, destination, method = 'shell', language = 'eng', verbose, alert) {

    async function converterShell() {
        const isInstalled = await Lookpath.lookpath('tesseract')
        if (!isInstalled) throw new Error('Tesseract not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `OMP_THREAD_LIMIT=1 tesseract -l ${language} --dpi 300 --psm 11 "${origin}/${item.root}/${item.pagefile}" - pdf`
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
        await FSExtra.writeFile(`${destination}/${item.root}/${item.pagefile.replace(/jpeg$/, 'pdf')}`, item.data)
        return true
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const converters = {
            shell: converterShell
        }
        const converter = await converters[method]()
        const convert = async item => {
            const exists = await FSExtra.pathExists(`${destination}/${item.root}/${item.pagefile}`)
            if (exists) return true
            await FSExtra.ensureDir(`${destination}/${item.root}`)
            try {
                const data = await converter.run(item)
                return { ...item, data }
            }
            catch (e) {
                console.error(`Error: ${e.message} (retrying...)`)
                return convert(item)
            }
        }
        const source = () => Scramjet.DataStream.from(Globby.globbyStream('**', { cwd: origin, deep: 2 })).map(path => {
            const [root, pagefile] = path.split('/')
            return { root, pagefile }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().map(convert).map(write)
        return { run, length, terminate: converter.terminate }
    }

    return setup()

}

export default initialise
