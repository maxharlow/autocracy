import OS from 'os'
import Util from 'util'
import FSExtra from 'fs-extra'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'
import Tesseract from 'tesseract.js'
import * as AWSTextract from '@aws-sdk/client-textract'
import Shared from '../shared.js'

async function initialise(origin, destination, parameters, alert) {

    const options = {
        method: 'tesseract',
        language: 'eng',
        density: 300,
        timeout: 5 * 60, // seconds
        awsRegion: 'eu-west-1',
        ...parameters
    }

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
        const run = async (item, controller) => {
            const command = `OMP_THREAD_LIMIT=1 tesseract -c tessedit_do_invert=0 -l ${options.language} --dpi ${options.density} --psm 12 "${escaped(item.input)}" -`
            try {
                const result = await execute(command, {
                    signal: controller.signal,
                    killSignal: 'SIGKILL'
                })
                if (controller.aborted) return
                controller.abort()
                await FSExtra.writeFile(item.output, result.stdout.replace(/\s+/g, ' '))
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
        const run = async (item, controller) => {
            const output = await scheduler.addJob('recognize', item.input, {}, {
                blocks: false,
                hocr: false,
                tsv: false
            })
            if (controller.aborted) return
            controller.abort()
            await FSExtra.writeFile(item.output, output.data.text.replace(/\s+/g, ' '))
        }
        return {
            run,
            shutdown: scheduler.terminate
        }
    }

    function converterAWSTextract() {
        const textract = new AWSTextract.TextractClient({ region: options.awsRegion })
        const run = async (item, controller) => {
            try {
                const detect = new AWSTextract.DetectDocumentTextCommand({
                    Document: {
                        Bytes: await FSExtra.readFile(item.input)
                    }
                })
                const response = await textract.send(detect, {
                    abortSignal: controller.signal
                })
                if (controller.aborted) return
                controller.abort()
                const text = response.Blocks.filter(block => block.BlockType == 'LINE').map(block => block.Text).join(' ')
                await FSExtra.writeFile(item.output, text.replace(/\s+/g, ' '))
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
        const run = async item => {
            if (item.skip) return item
            await FSExtra.ensureDir(`${destination}/${item.name}`)
            alert({
                operation: 'convert-image-pages-to-text-pages',
                input: item.input,
                output: item.output,
                message: 'converting...'
            })
            try {
                const controller = withTimeout(async () => {
                    await FSExtra.writeFile(item.output, '') // write a blank file
                })
                await method.run(item, controller)
                alert({
                    operation: 'convert-image-pages-to-text-pages',
                    input: item.input,
                    output: item.output,
                    message: 'done'
                })
                return item
            }
            catch (e) {
                if (e.message === 'the operation was aborted') {
                    alert({
                        operation: 'convert-image-pages-to-text-pages',
                        input: item.input,
                        output: item.output,
                        message: `timed out after ${options.timeout}s`,
                        importance: 'warning'
                    })
                    return item // timeouts aren't errors
                }
                alert({
                    operation: 'convert-image-pages-to-text-pages',
                    input: item.input,
                    output: item.output,
                    message: e.message,
                    importance: 'error'
                })
                return { ...item, skip: true } // execution failed with message
            }
        }
        return {
            run,
            shutdown: method.shutdown
        }
    }

    async function check(item) {
        const outputExists = await FSExtra.exists(item.output)
        if (outputExists) {
            alert({
                operation: 'convert-image-pages-to-text-pages',
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return { ...item, skip: true } // we can use cached output
        }
        const inputExists = await FSExtra.exists(item.input)
        if (!inputExists) {
            alert({
                operation: 'convert-image-pages-to-text-pages',
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
        const convert = await converter()
        const source = () => Shared.source(origin, destination, { paged: true }).unorder(entry => {
            return {
                ...entry,
                output: entry.output.replace(/png$/, 'txt')
            }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => {
            // AWS Textract DetectDocumentText transactions per second quotas: https://docs.aws.amazon.com/general/latest/gr/textract.html#limits_textract
            if (options.method === 'aws-textract') return source().unorder(check).setOptions({ maxParallel: 10 }).unorder(convert.run)
            return source().unorder(check).unorder(convert.run)
        }
        return {
            run,
            length,
            shutdown: convert.shutdown
        }
    }

    return setup()

}

export default initialise
