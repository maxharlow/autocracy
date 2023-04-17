import Util from 'util'
import FSExtra from 'fs-extra'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'
import shared from '../shared.js'

async function initialise(origin, destination, parameters, alert) {

    const operation = 'extract-pdf-to-text'
    const options = {
        useCache: false,
        method: 'mupdf',
        ...parameters
    }
    const cache = await shared.caching(operation)
    const waypoint = shared.waypointWith(alert, cache)

    async function extractorMuPDF() {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const escaped = path => path.replaceAll('"', '\\"')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `mutool draw -F txt "${escaped(item.input)}"`
            try {
                const result = await execute(command)
                const text = result.stdout.replace(/\s+/g, ' ')
                if (text.trim() === '') return false
                await FSExtra.writeFile(item.output, text)
                return true
            }
            catch (e) {
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

    async function extract() {
        const methods = {
            mupdf: extractorMuPDF
        }
        const method = await methods[options.method]()
        const run = async item => {
            if (item.skip) return item
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'extracting...'
            })
            try {
                const hasText = await method(item)
                if (!hasText) {
                    waypoint({
                        operation,
                        input: item.input,
                        output: item.output,
                        message: 'no text found'
                    })
                    return { ...item, skip: true } // no text found
                }
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
        await FSExtra.ensureDir(destination)
        const extractor = await extract()
        const source = () => shared.source(origin, destination)
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().unorder(check).unorder(extractor)
        return { run, length }
    }

    return setup()

}

export default initialise
