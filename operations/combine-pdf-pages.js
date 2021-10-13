import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'

async function initialise(origin, destination, method = 'shell', verbose, alert) {

    async function combinerShell() {
        const isInstalled = await Lookpath.lookpath('pdfunite')
        if (!isInstalled) throw new Error('Poppler not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const pages = await Globby.globby(`${origin}/${item.root}`)
            const pagesList = pages.map(page => `"${page}"`).join(' ')
            const command = `pdfunite ${pagesList} /dev/stdout`
            if (verbose) alert(command)
            const result = await execute(command, { encoding: 'binary', maxBuffer: 4 * 1024 * 1024 * 1024 }) // 4GB
            return Buffer.from(result.stdout, 'binary')
        }
        return { run }
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const combiners = {
            shell: combinerShell
        }
        const combiner = await combiners[method](destination)
        const write = async item => {
            await FSExtra.writeFile(`${destination}/${item.root}`, item.data)
            return true
        }
        const combine = async item => {
            const path = `${destination}/${item.root}`
            const exists = await FSExtra.pathExists(path)
            if (exists) return
            try {
                const data = await combiner.run(item)
                return { ...item, data }
            }
            catch (e) {
                console.error(`Error: ${e.message} (retrying...)`)
                return combine(item)
            }
        }
        const source = () => Scramjet.DataStream.from(Globby.globbyStream('*', { cwd: origin, deep: 1, onlyFiles: false })).map(root => {
            return { root }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().setOptions({ maxParallel: 1 }).map(combine).each(write)
        return { run, length }
    }

    return setup()

}

export default initialise
