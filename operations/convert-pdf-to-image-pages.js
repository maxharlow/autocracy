import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'
import MuPDF from 'mupdf-js'

async function initialise(origin, destination, options = { method: 'library', density: 300 }, verbose, alert) {

    async function converterShell(destination) {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `mutool draw -r ${options.density} -o "${destination}/${item.root}/page-%04d.png" "${origin}/${item.root}"`
            if (verbose) alert(command)
            await execute(command)
        }
        return { run }
    }

    async function converterLibrary(destination) {
        const run = async item => {
            const consoleWarn = console.warn // suppress MuPDF messages
            console.warn = () => {} // suppress MuPDF messages
            const processor = await MuPDF.createMuPdf()
            console.warn = consoleWarn // suppress MuPDF messages
            const documentData = await FSExtra.readFile(`${origin}/${item.root}`)
            const document = processor.load(documentData)
            const pages = processor.countPages(document)
            const pagesOutput = Array.from({ length: pages }).map((_, page) => {
                const pagePadded = page.toString().padStart(4, '0')
                const imageData = processor.drawPageAsPNG(document, page + 1, options.density)
                const image = Buffer.from(imageData.split(',').pop(), 'base64')
                return FSExtra.writeFile(`${destination}/${item.root}/page-${pagePadded}.png`, image)
            })
            await Promise.all(pagesOutput)
            return item
        }
        return { run }
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const converters = {
            shell: converterShell,
            library: converterLibrary
        }
        const converter = await converters[options.method](destination)
        const convert = async item => {
            const outputExists = await FSExtra.exists(`${destination}/${item.root}`)
            if (outputExists) return { item, skip: true } // already exists, skip
            const inputExists = await FSExtra.exists(`${origin}/${item.root}`)
            if (!inputExists) return { item, skip: true } // no input, skip
            await FSExtra.mkdir(`${destination}/${item.root}`)
            try {
                await converter.run(item)
                return item
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
        const source = () => Scramjet.DataStream.from(sourceGenerator()).map(file => {
            return {
                root: file.name
            }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().map(convert)
        return { run, length }
    }

    return setup()

}

export default initialise