import Util from 'util'
import FSExtra from 'fs-extra'
import Lookpath from 'lookpath'
import * as Tempy from 'tempy'
import ChildProcess from 'child_process'
import MuPDF from 'mupdf-js'
import shared from '../shared.js'

async function initialise(input, output, parameters, tick, alert) {

    const operation = 'convert-pdf-to-image-pages'
    const options = {
        useCache: false,
        method: 'mupdf',
        density: 300,
        ...parameters
    }
    const cache = await shared.caching(operation)
    const waypoint = shared.waypointWith(alert, cache)

    async function converterMuPDF() {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const escaped = path => path.replaceAll('"', '\\"')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const result = Tempy.temporaryDirectory()
            const command = `mutool draw -r ${options.density} -o "${result}/page-%d.png" "${escaped(item.input)}"`
            try {
                await execute(command)
                await FSExtra.move(result, `${item.output}`)
            }
            catch (e) {
                await FSExtra.remove(result)
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

    async function converterMuPDFJS() {
        const consoleWarn = console.warn // suppress MuPDF messages
        console.warn = () => {} // suppress MuPDF messages
        const processor = await MuPDF.createMuPdf()
        console.warn = consoleWarn // suppress MuPDF messages
        const run = async item => {
            const documentData = await FSExtra.readFile(item.input)
            const document = processor.load(documentData)
            const pages = processor.countPages(document)
            const result = Tempy.temporaryDirectory()
            const pagesOutput = Array.from({ length: pages }).map(async (_, index) => {
                const page = index + 1
                waypoint({
                    operation,
                    input: item.input,
                    output: item.output,
                    message: `converting page ${page} of ${pages}...`
                })
                const imageData = processor.drawPageAsPNG(document, page, options.density)
                const image = Buffer.from(imageData.split(',').pop(), 'base64')
                return FSExtra.writeFile(`${result}/page-${page}.png`, image)
            })
            await Promise.all(pagesOutput)
            await FSExtra.move(result, item.output)
        }
        return run
    }

    async function convert() {
        const methods = {
            mupdf: converterMuPDF,
            mupdfjs: converterMuPDFJS
        }
        const method = await methods[options.method]()
        const run = async item => {
            if (item.skip) return item
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'converting...'
            })
            try {
                await method(item)
                waypoint({
                    operation,
                    input: item.input,
                    output: item.output,
                    message: 'done'
                })
                return item
            }
            catch (e) {
                waypoint({
                    operation,
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
        if (options.useCache) {
            const cached = cache.existing.get(item.input)
            if (cached) {
                waypoint({
                    operation,
                    input: item.input,
                    output: item.output,
                    cached: true,
                    ...cached
                })
                return { ...item, skip: true }
            }
        }
        const outputExists = await FSExtra.exists(item.output)
        if (outputExists) {
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return { ...item, skip: true } // we can use cached output
        }
        const inputExists = await FSExtra.exists(item.input)
        if (!inputExists) {
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'no input'
            })
            return { ...item, skip: true } // exists in initial-origin but not origin
        }
        const buffer = Buffer.alloc(5)
        await FSExtra.read(await FSExtra.open(item.input, 'r'), buffer, 0, 5)
        if (buffer.toString() != '%PDF-') {
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'not a valid PDF file',
                importance: 'error'
            })
            return { ...item, skip: true } // not a valid PDF file
        }
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(output)
        const converter = await convert()
        const run = async item => {
            const itemLocated = {
                name: item.name,
                input: `${input}/${item.name}`,
                output: `${output}/${item.name}`
            }
            await converter(await check(itemLocated))
            tick()
            return item
        }
        return { run }
    }

    return setup()

}

export default initialise
