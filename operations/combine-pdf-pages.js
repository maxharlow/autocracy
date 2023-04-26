import Util from 'util'
import FSExtra from 'fs-extra'
import PDF from 'pdfjs'
import Lookpath from 'lookpath'
import * as Tempy from 'tempy'
import ChildProcess from 'child_process'
import shared from '../shared.js'

async function initialise(input, output, parameters, tick, alert) {

    const operation = 'combine-pdf-pages'
    const options = {
        useCache: false,
        method: 'mupdf',
        ...parameters
    }
    const cache = await shared.caching(operation)
    const waypoint = shared.waypointWith(alert, cache)

    async function combinerMuPDF() {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const escaped = path => path.replaceAll('"', '\\"')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const result = Tempy.temporaryFile()
            const pagesList = item.pages.map(page => `"${escaped(item.input)}/${page}"`).join(' ')
            const command = `mutool merge -o ${result} ${pagesList}`
            try {
                await execute(command)
                await FSExtra.move(result, item.output)
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

    async function combinerPDFJS() {
        const run = async item => {
            const document = new PDF.Document()
            await item.pages.reduce(async (previous, page) => {
                await previous
                const pageData = await FSExtra.readFile(`${origin}/${item.name}/${page}`)
                const pageDocument = new PDF.ExternalDocument(pageData)
                document.addPagesOf(pageDocument)
            }, Promise.resolve())
            const data = document.asBuffer()
            await FSExtra.writeFile(item.output, data)
        }
        return run
    }

    async function combiner() {
        const methods = {
            mupdf: combinerMuPDF,
            pdfjs: combinerPDFJS // slightly slower, has a 2GB limit for output files
        }
        const method = await methods[options.method]()
        const run = async item => {
            if (item.skip) return item
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: `combining ${item.pages.length} pages...`
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

    async function listing(item) {
        if (item.skip) return item
        const pagesUnsorted = await FSExtra.readdir(item.input)
        if (pagesUnsorted.length === 0) {
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'no pages found',
                importance: 'error'
            })
            return { ...item, skip: true } // no pages found to combine
        }
        if (options.originPrior) {
            const pagesPrior = await FSExtra.readdir(`${options.originPrior}/${item.name}`)
            if (pagesUnsorted.length < pagesPrior.length) {
                waypoint({
                    operation,
                    input: item.input,
                    output: item.output,
                    message: 'pagefiles missing',
                    importance: 'error'
                })
                return { ...item, skip: true } // don't combine an incomplete set of pages
            }
        }
        const pages = pagesUnsorted.sort((a, b) => {
            return Number(a.replace(/[^0-9]/g, '')) - Number(b.replace(/[^0-9]/g, ''))
        })
        return { ...item, pages }
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
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(output)
        const combine = await combiner()
        const run = async item => {
            const itemLocated = {
                name: item.name,
                input: `${input}/${item.name}`,
                output: `${output}/${item.name}`
            }
            await combine(await listing(await check(itemLocated)))
            tick()
            return item
        }
        return { run }
    }

    return setup()

}

export default initialise
