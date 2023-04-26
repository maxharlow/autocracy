import OS from 'os'
import Util from 'util'
import FSExtra from 'fs-extra'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'
import Scramjet from 'scramjet'
import Tesseract from 'tesseract.js'
import * as AWSTextract from '@aws-sdk/client-textract'
import shared from '../shared.js'

async function initialise(input, output, parameters, tick, alert) {

    const operation = 'convert-image-pages-to-text-pages'
    const options = {
        useCache: false,
        method: 'tesseract',
        language: 'eng',
        density: 300,
        timeout: 5 * 60, // seconds
        awsRegion: undefined, // will be picked by AWS client
        ...parameters
    }
    const cache = await shared.caching(operation)
    const waypoint = shared.waypointWith(alert, cache)

    function withTimeout(alternative) {
        const controller = new AbortController()
        const onTimeout = async () => {
            if (controller.signal.aborted) return
            controller.abort()
            await alternative()
        }
        const id = setTimeout(onTimeout, options.timeout * 1000)
        controller.signal.addEventListener('abort', () => clearTimeout(id))
        return controller
    }

    async function converterTesseract() {
        const isInstalled = await Lookpath.lookpath('tesseract')
        if (!isInstalled) throw new Error('Tesseract not found!')
        const escaped = path => path.replaceAll('"', '\\"')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async (page, controller) => {
            const command = `OMP_THREAD_LIMIT=1 tesseract -c tessedit_do_invert=0 -l ${options.language} --dpi ${options.density} --psm 12 "${escaped(page.input)}" -`
            try {
                const result = await execute(command, {
                    signal: controller.signal,
                    killSignal: 'SIGKILL'
                })
                if (controller.aborted) return
                controller.abort()
                await FSExtra.writeFile(page.output, result.stdout.replace(/\s+/g, ' '))
            }
            catch (e) {
                controller.abort()
                const message = e.message.trim().split('\n').pop().toLowerCase().replace(/\.$/, '')
                throw new Error(message)
            }
        }
        return {
            run,
            shutdown: () => {} // for consistency
        }
    }

    async function converterTesseractJS() {
        const scheduler = Tesseract.createScheduler()
        await Array.from({ length: OS.cpus().length }).reduce(async previous => {
            await previous
            const worker = await Tesseract.createWorker()
            await worker.loadLanguage(options.language)
            await worker.initialize(options.language)
            await worker.setParameters({
                tessedit_do_invert: false,
                user_defined_dpi: options.density,
                tessedit_pageseg_mode: Tesseract.PSM.PSM_SPARSE_TEXT
            })
            scheduler.addWorker(worker)
        }, Promise.resolve())
        const run = async (page, controller) => {
            const result = await scheduler.addJob('recognize', page.input, {}, {
                blocks: false,
                hocr: false,
                tsv: false
            })
            if (controller.aborted) return
            controller.abort()
            await FSExtra.writeFile(page.output, result.data.text.replace(/\s+/g, ' '))
        }
        return {
            run,
            shutdown: scheduler.terminate
        }
    }

    async function converterAWSTextract() {
        const textract = new AWSTextract.TextractClient({ region: options.awsRegion })
        waypoint({
            operation,
            message: `using ${await textract.config.region()} AWS region`,
            importance: 'warning'
        })
        const run = async (page, controller) => {
            try {
                const detect = new AWSTextract.DetectDocumentTextCommand({
                    Document: {
                        Bytes: await FSExtra.readFile(page.input)
                    }
                })
                const response = await textract.send(detect, {
                    abortSignal: controller.signal
                })
                if (controller.aborted) return
                controller.abort()
                const text = response.Blocks.filter(block => block.BlockType == 'LINE').map(block => block.Text).join(' ')
                await FSExtra.writeFile(page.output, text.replace(/\s+/g, ' '))
            }
            catch (e) {
                controller.abort()
                const message = e.message.toLowerCase()
                throw new Error(message)
            }
        }
        return {
            run,
            shutdown: () => {} // for consistency
        }
    }

    async function converter() {
        const methods = {
            'aws-textract': converterAWSTextract,
            tesseractjs: converterTesseractJS, // much slower
            tesseract: converterTesseract
        }
        const method = await methods[options.method]()
        const run = async page => {
            if (page.skip) return page
            await FSExtra.ensureDir(page.outputDirectory)
            waypoint({
                operation,
                input: page.input,
                output: page.output,
                message: 'converting...'
            })
            try {
                const controller = withTimeout(async () => {
                    await FSExtra.writeFile(page.output, '') // write a blank file
                })
                await method.run(page, controller)
                waypoint({
                    operation,
                    input: page.input,
                    output: page.output,
                    message: 'done'
                })
                return page
            }
            catch (e) {
                if (e.message === 'the operation was aborted') {
                    waypoint({
                        operation,
                        input: page.input,
                        output: page.output,
                        message: `timed out after ${options.timeout}s`,
                        importance: 'warning'
                    })
                    return page // timeouts aren't errors
                }
                waypoint({
                    operation,
                    input: page.input,
                    output: page.output,
                    message: e.message,
                    importance: 'error'
                })
                return { ...page, skip: true } // execution failed with message
            }
        }
        return {
            run,
            shutdown: method.shutdown
        }
    }

    async function check(page) {
        if (options.useCache) {
            const cached = cache.existing.get(page.input)
            if (cached) {
                waypoint({
                    operation,
                    input: page.input,
                    output: page.output,
                    cached: true,
                    ...cached
                })
                return { ...page, skip: true }
            }
        }
        const outputExists = await FSExtra.exists(page.output)
        if (outputExists) {
            waypoint({
                operation,
                input: page.input,
                output: page.output,
                message: 'output exists'
            })
            return { ...page, skip: true } // we can use cached output
        }
        const inputExists = await FSExtra.exists(page.input)
        if (!inputExists) {
            waypoint({
                operation,
                input: page.input,
                output: page.output,
                message: 'no input'
            })
            return { ...page, skip: true } // exists in initial-origin but not origin
        }
        return page
    }

    async function paged(item) {
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
                return []
            }
        }
        const inputExists = await FSExtra.exists(`${input}/${item.name}`)
        if (!inputExists) {
            waypoint({
                operation,
                input: `${input}/${item.name}`,
                output: `${output}/${item.name}`,
                message: 'no input directory'
            })
            return []
        }
        const pages = await FSExtra.readdir(`${input}/${item.name}`)
        return pages.map(page => {
            return {
                name: `${item.name}/${page}`,
                input: `${input}/${item.name}/${page}`,
                output: `${output}/${item.name}/${page.replace(/png$/, 'txt')}`,
                outputDirectory: `${output}/${item.name}`
            }
        })
    }

    async function setup() {
        await FSExtra.ensureDir(output)
        const convert = await converter()
        const run = async item => {
            // AWS Textract DetectDocumentText transactions per second quotas: https://docs.aws.amazon.com/general/latest/gr/textract.html#limits_textract
            const pages = await paged(item)
            await Scramjet.DataStream.from(pages).map(check).setOptions(options.method === 'aws-textract' ? { maxParallel: 10 } : {}).map(convert.run).run()
            tick()
            return item
        }
        return { run, shutdown: convert.shutdown }
    }

    return setup()

}

export default initialise
