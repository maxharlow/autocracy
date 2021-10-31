import OS from 'os'
import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'
import Tesseract from 'tesseract.js'
import * as AWSTextract from '@aws-sdk/client-textract'

async function initialise(origin, destination, parameters, alert) {

    const options = {
        method: 'shell',
        language: 'eng',
        density: 300,
        awsRegion: 'eu-west-1',
        ...parameters
    }

    async function converterShell() {
        const isInstalled = await Lookpath.lookpath('tesseract')
        if (!isInstalled) throw new Error('Tesseract not found!')
        const escaped = path => path.replaceAll('"', '\\"')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `OMP_THREAD_LIMIT=1 tesseract -c tessedit_do_invert=0 -l ${options.language} --dpi ${options.density} --psm 11 "${escaped(item.input)}" -`
            try {
                const result = await execute(command)
                await FSExtra.writeFile(item.output, result.stdout.replace(/\s+/g, ' '))
            }
            catch (e) {
                const message = e.message.trim().split('\n').pop().toLowerCase()
                throw new Error(message)
            }
        }
        return {
            run,
            terminate: () => {} // for consistency
        }
    }

    async function converterLibrary() {
        const scheduler = Tesseract.createScheduler()
        await Array.from({ length: OS.cpus().length }).reduce(async previous => {
            await previous
            const worker = Tesseract.createWorker()
            await worker.load()
            await worker.loadLanguage(options.language)
            await worker.initialize(options.language)
            await worker.setParameters({
                tessjs_create_hocr: false,
                tessjs_create_tsv: false,
                tessedit_do_invert: false,
                user_defined_dpi: options.density,
                tessedit_pageseg_mode: Tesseract.PSM.PSM_SPARSE_TEXT
            })
            scheduler.addWorker(worker)
        }, Promise.resolve())
        const run = async item => {
            const output = await scheduler.addJob('recognize', item.input)
            await FSExtra.writeFile(item.output, output.data.text.replace(/\s+/g, ' '))
        }
        return {
            run,
            terminate: scheduler.terminate
        }
    }

    function converterAWSTextract() {
        const textract = new AWSTextract.TextractClient({ region: options.awsRegion })
        const run = async item => {
            const detect = new AWSTextract.DetectDocumentTextCommand({
                Document: {
                    Bytes: await FSExtra.readFile(item.input)
                }
            })
            const response = await textract.send(detect)
            const text = response.Blocks.filter(block => block.BlockType == 'LINE').map(block => block.Text).join(' ')
            await FSExtra.writeFile(item.output, text.replace(/\s+/g, ' '))
        }
        return {
            run,
            terminate: () => {} // for consistency
        }
    }

    async function converter() {
        const methods = {
            'aws-textract': converterAWSTextract,
            library: converterLibrary, // much slower
            shell: converterShell
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
                await method.run(item)
                alert({
                    operation: 'convert-image-pages-to-text-pages',
                    input: item.input,
                    output: item.output,
                    message: 'done'
                })
                return item
            }
            catch (e) {
                alert({
                    operation: 'convert-image-pages-to-text-pages',
                    input: item.input,
                    output: item.output,
                    message: e.message,
                    importance: 'error'
                })
                return { ...item, skip: true } // failed with error
            }
        }
        return {
            run,
            terminate: method.terminate
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
            return { ...item, skip: true } // already exists, skip
        }
        const inputExists = await FSExtra.exists(item.input)
        if (!inputExists) {
            alert({
                operation: 'convert-image-pages-to-text-pages',
                input: item.input,
                output: item.output,
                message: 'no input'
            })
            return { ...item, skip: true } // no input, skip
        }
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const convert = await converter()
        const source = () => {
            const listing = FSExtra.opendir(options.originInitial || origin)
            return Scramjet.DataStream.from(listing).flatMap(async entry => {
                const exists = await FSExtra.exists(`${origin}/${entry.name}`)
                if (!exists) return []
                const pages = await FSExtra.readdir(`${origin}/${entry.name}`, { withFileTypes: true })
                return pages.map(page => {
                    if (!page.isFile()) return
                    return {
                        name: entry.name,
                        input: `${origin}/${entry.name}/${page.name}`,
                        output: `${destination}/${entry.name}/${page.name.replace(/png$/, 'txt')}`
                    }
                }).filter(x => x)
            })
        }
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => {
            if (options.method === 'aws-textract') return source().unorder(check).setOptions({ maxParallel: 1 }).rate(1).unorder(convert.run)
            return source().unorder(check).unorder(convert.run)
        }
        return {
            run,
            length,
            terminate: convert.terminate
        }
    }

    return setup()

}

export default initialise
