import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import Tempy from 'tempy'
import ChildProcess from 'child_process'
import MuPDF from 'mupdf-js'

async function initialise(origin, destination, options = { method: 'shell', density: 300 }, verbose, alert) {

    async function converterShell() {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const output = Tempy.directory()
            const command = `mutool draw -r ${options.density} -o "${output}/page-%d.png" "${item.input}"`
            await execute(command)
            await FSExtra.move(output, `${item.output}`)
            if (verbose) alert({
                operation: 'convert-pdf-to-image-pages',
                input: item.input,
                output: item.output,
                message: 'done'
            })
        }
        return { run }
    }

    async function converterLibrary() {
        const consoleWarn = console.warn // suppress MuPDF messages
        console.warn = () => {} // suppress MuPDF messages
        const processor = await MuPDF.createMuPdf()
        console.warn = consoleWarn // suppress MuPDF messages
        const run = async item => {
            const documentData = await FSExtra.readFile(item.input)
            const document = processor.load(documentData)
            const pages = processor.countPages(document)
            const output = Tempy.directory()
            const pagesOutput = Array.from({ length: pages }).map(async (_, index) => {
                const page = index + 1
                if (verbose) alert({
                    operation: 'convert-pdf-to-image-pages',
                    input: item.input,
                    output: item.output,
                    message: `converting page ${page} of ${pages}...`
                })
                const imageData = processor.drawPageAsPNG(document, page, options.density)
                const image = Buffer.from(imageData.split(',').pop(), 'base64')
                return FSExtra.writeFile(`${output}/page-${page}.png`, image)
            })
            await Promise.all(pagesOutput)
            await FSExtra.move(output, item.output)
            if (verbose) alert({
                operation: 'convert-pdf-to-image-pages',
                input: item.input,
                output: item.output,
                message: 'done'
            })
        }
        return { run }
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
                    operation: 'convert-pdf-to-image-pages',
                    input: item.input,
                    output: item.output,
                    message: 'output exists'
                })
                return { ...item, skip: true } // already exists, skip
            }
            const inputExists = await FSExtra.exists(item.input)
            if (!inputExists) {
                if (verbose) alert({
                    operation: 'convert-pdf-to-image-pages',
                    input: item.input,
                    output: item.output,
                    message: 'no input'
                })
                return { ...item, skip: true } // no input, skip
            }
            if (verbose) alert({
                operation: 'convert-pdf-to-image-pages',
                input: item.input,
                output: item.output,
                message: 'converting...'
            })
            try {
                await converter.run(item)
                return item
            }
            catch (e) {
                alert({
                    operation: 'convert-pdf-to-image-pages',
                    input: item.input,
                    output: item.output,
                    message: e.message,
                    isError: true
                })
                return { ...item, skip: true } // failed with error
            }
        }
        const sourceGenerator = () => Globby.globbyStream(options.originInitial || origin, {
            objectMode: true,
            deep: 1
        })
        const source = () => Scramjet.DataStream.from(sourceGenerator()).map(file => {
            return {
                name: file.name,
                input: `${origin}/${file.name}`,
                output: `${destination}/${file.name}`
            }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().unorder(convert)
        return { run, length }
    }

    return setup()

}

export default initialise
