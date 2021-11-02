import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import Lookpath from 'lookpath'
import Tempy from 'tempy'
import ChildProcess from 'child_process'
import MuPDF from 'mupdf-js'

async function initialise(origin, destination, parameters, alert) {

    const options = {
        method: 'shell',
        density: 300,
        ...parameters
    }

    async function converterShell() {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const escaped = path => path.replaceAll('"', '\\"')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            if (item.skip) return item
            const output = Tempy.directory()
            const command = `mutool draw -r ${options.density} -o "${output}/page-%d.png" "${escaped(item.input)}"`
            try {
                await execute(command)
                await FSExtra.move(output, `${item.output}`)
            }
            catch (e) {
                await FSExtra.remove(output)
                const message = e.message.trim()
                    .split('\n')
                    .filter(line => !line.match(/Command failed:|warning:|aborting process/))
                    .map(line => line.replace('error: ', ''))
                    .join(', ')
                    .toLowerCase()
                throw new Error(message)
            }
        }
        return run
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
                alert({
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
        }
        return run
    }

    async function convert() {
        const methods = {
            shell: converterShell,
            library: converterLibrary
        }
        const method = await methods[options.method]()
        const run = async item => {
            if (item.skip) return item
            alert({
                operation: 'convert-pdf-to-image-pages',
                input: item.input,
                output: item.output,
                message: 'converting...'
            })
            try {
                await method(item)
                alert({
                    operation: 'convert-pdf-to-image-pages',
                    input: item.input,
                    output: item.output,
                    message: 'done'
                })
                return item
            }
            catch (e) {
                alert({
                    operation: 'convert-pdf-to-image-pages',
                    input: item.input,
                    output: item.output,
                    message: e.message,
                    importance: 'error'
                })
                return { ...item, skip: true } // execution failed with message
            }
        }
        return run
    }

    async function check(item) {
        const outputExists = await FSExtra.exists(item.output)
        if (outputExists) {
            alert({
                operation: 'convert-pdf-to-image-pages',
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return { ...item, skip: true } // we can use cached output
        }
        const inputExists = await FSExtra.exists(item.input)
        if (!inputExists) {
            alert({
                operation: 'convert-pdf-to-image-pages',
                input: item.input,
                output: item.output,
                message: 'no input'
            })
            return { ...item, skip: true } // exists in initial-origin but not origin
        }
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const converter = await convert()
        const source = () => {
            const listing = FSExtra.opendir(options.originInitial || origin)
            return Scramjet.DataStream.from(listing).map(entry => {
                if (!entry.isFile()) return
                return {
                    name: entry.name,
                    input: `${origin}/${entry.name}`,
                    output: `${destination}/${entry.name}`
                }
            }).filter(x => x)
        }
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().unorder(check).unorder(converter)
        return { run, length }
    }

    return setup()

}

export default initialise
