import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import Tempy from 'tempy'
import ChildProcess from 'child_process'

async function initialise(origin, destination, method = 'shell', verbose, alert) {

    async function listing(item) {
        const pages = await Globby.globby(`${origin}/${item.root}`)
        if (pages.length === 0) {
            alert(`No page files found for ${item.root}!`)
            return { item, skip: true } // no pages found to combine, skip
        }
        return {
            root: item.root,
            pages
        }
    }

    async function combinerShell() {
        const isInstalled = await Lookpath.lookpath('pdfunite')
        if (!isInstalled) throw new Error('Poppler not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            if (item.skip) return item
            const pagesList = item.pages.map(page => `"${page}"`).join(' ')
            const output = Tempy.file()
            const command = `pdfunite ${pagesList} ${output}`
            if (verbose) alert(command)
            await execute(command)
            const result = await FSExtra.readFile(output)
            await FSExtra.remove(output)
            return result
        }
        return { run }
    }

    async function write(item)  {
        if (item.skip) return item
        await FSExtra.writeFile(`${destination}/${item.root}`, item.data)
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const combiners = {
            shell: combinerShell
        }
        const combiner = await combiners[method](destination)
        const combine = async item => {
            const path = `${destination}/${item.root}`
            const exists = await FSExtra.pathExists(path)
            if (exists) return { item, skip: true } // already exists, skip
            try {
                const data = await combiner.run(item)
                return { ...item, data }
            }
            catch (e) {
                console.error(`Error: ${e.message} (retrying...)`)
                if (verbose) console.error(e.stack)
                return combine(item)
            }
        }
        const source = () => Scramjet.DataStream.from(Globby.globbyStream('*', { cwd: origin, deep: 1, onlyFiles: false })).map(root => {
            return { root }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().setOptions({ maxParallel: 1 }).map(listing).map(combine).each(write)
        return { run, length }
    }

    return setup()

}

export default initialise
