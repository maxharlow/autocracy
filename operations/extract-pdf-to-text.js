import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'
import PDF2Json from 'pdf2json'

async function initialise(origin, destination, method = 'shell', verbose, alert) {

    async function extractorShell() {
        const isInstalled = await Lookpath.lookpath('pdftotext')
        if (!isInstalled) throw new Error('Poppler not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `pdftotext "${origin}/${item.root}" -`
            if (verbose) alert(command)
            const result = await execute(command)
            return result.stdout
        }
        return { run }
    }

    async function extractorLibrary() {
        const run = async item => {
            const parser = new PDF2Json(null, true)
            const result = await new Promise((resolve, reject) => {
                parser.on('pdfParser_dataError', reject)
                parser.on('pdfParser_dataReady', () => resolve(parser.getRawTextContent()))
                parser.loadPDF(`${origin}/${item.root}`)
            })
            return result
        }
        return { run }
    }

    async function write(item) {
        if (item.text.trim() === '') return null // don't write empty files
        await FSExtra.writeFile(`${destination}/${item.root}`, item.text)
        return null
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const extractors = {
            shell: extractorShell,
            library: extractorLibrary
        }
        const extractor = await extractors[method](destination)
        const extract = async item => {
            const path = `${destination}/${item.root}`
            const exists = await FSExtra.pathExists(path)
            if (exists) return // already exists, skip
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
        const source = () => Scramjet.DataStream.from(Globby.globbyStream('*', { cwd: origin, deep: 1 })).map(root => {
            return { root }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().setOptions({ maxParallel: 1 }).map(extract).each(write)
        return { run, length }
    }

    return setup()

}

export default initialise
