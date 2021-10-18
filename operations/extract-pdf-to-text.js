import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'

async function initialise(origin, destination, options = { method: 'shell' }, verbose, alert) {

    async function extractorShell() {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `mutool draw -F txt "${origin}/${item.root}"`
            if (verbose) alert(command)
            const result = await execute(command)
            return result.stdout
        }
        return { run }
    }

    async function write(item) {
        if (item.skip) return item
        if (item.text.trim() === '') return item // don't write empty files
        await FSExtra.writeFile(`${destination}/${item.root}`, item.text)
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const extractors = {
            shell: extractorShell
        }
        const extractor = await extractors[options.method](destination)
        const extract = async item => {
            const path = `${destination}/${item.root}`
            const outputExists = await FSExtra.exists(path)
            if (outputExists) return { item, skip: true } // already exists, skip
            try {
                const result = await extractor.run(item)
                const text = result.replace(/\s+/g, ' ')
                return { ...item, text }
            }
            catch (e) {
                console.error(`Error: ${e.message} (retrying...)`)
                if (verbose) console.error(e.stack)
                return extract(item)
            }
        }
        const sourceGenerator = () => Globby.globbyStream(origin, {
            objectMode: true,
            deep: 1
        })
        const source = () => Scramjet.DataStream.from(sourceGenerator()).map(file => {
            return {
                root: file.name
            }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().setOptions({ maxParallel: 1 }).map(extract).each(write)
        return { run, length }
    }

    return setup()

}

export default initialise
