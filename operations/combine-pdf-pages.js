import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import Tempy from 'tempy'
import ChildProcess from 'child_process'

async function initialise(origin, destination, options = { method: 'shell' }, verbose, alert) {

    async function listing(item) {
        const pages = await Globby.globby(`${origin}/${item.name}`)
        if (pages.length === 0) return { item, skip: true } // no pages found to combine, skip
        return {
            name: item.name,
            pages
        }
    }

    async function combinerShell() {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            if (item.skip) return item
            const pagesList = item.pages.map(page => `"${page}"`).join(' ')
            const output = Tempy.file()
            const command = `mutool merge -o ${output} ${pagesList}`
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
        await FSExtra.writeFile(`${destination}/${item.name}`, item.data)
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const combiners = {
            shell: combinerShell
        }
        const combiner = await combiners[options.method](destination)
        const combine = async item => {
            const outputExists = await FSExtra.exists(`${destination}/${item.name}`)
            if (outputExists) return { item, skip: true } // already exists, skip
            const inputExists = await FSExtra.exists(`${origin}/${item.name}`)
            if (!inputExists) return { item, skip: true } // no input, skip
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
        const sourceGenerator = () => Globby.globbyStream(options.originInitial || origin, {
            objectMode: true,
            deep: 1
        })
        const source = () => Scramjet.DataStream.from(sourceGenerator()).map(file => {
            return {
                name: file.name
            }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().setOptions({ maxParallel: 1 }).map(listing).map(combine).each(write)
        return { run, length }
    }

    return setup()

}

export default initialise
