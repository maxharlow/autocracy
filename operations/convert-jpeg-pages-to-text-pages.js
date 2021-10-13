import OS from 'os'
import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'
import Tesseract from 'tesseract.js'
import * as AWSTextract from '@aws-sdk/client-textract'

async function initialise(origin, destination, method = 'shell', language = 'eng', verbose, alert) {

    async function converterShell() {
        const isInstalled = await Lookpath.lookpath('tesseract')
        if (!isInstalled) throw new Error('Tesseract not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `OMP_THREAD_LIMIT=1 tesseract -l ${language} --dpi 300 --psm 11 "${origin}/${item.root}/${item.pagefile}" -`
            if (verbose) alert(command)
            const result = await execute(command)
            return result.stdout
        }
        return {
            run,
            terminate: () => {} // for consistency
        }
    }

    async function converterLibrary() { // todo -- this doesn't work
        const parallel = OS.cpus().length * 2 // Scramjet default
        const scheduler = Tesseract.createScheduler()
        await Array.from({ length: parallel }).reduce(async previous => {
            await previous
            const worker = Tesseract.createWorker()
            await worker.load()
            await worker.loadLanguage(language)
            await worker.initialize(language)
            await worker.setParameters({
                user_defined_dpi: 300,
                tessedit_pageseg_mode: Tesseract.PSM.PSM_SPARSE_TEXT
            })
            scheduler.addWorker(worker)
            return
        })
        const run = async item => {
            const output = await scheduler.addJob('recognize', `${origin}/${item.root}/${item.pagefile}`)
            return output.data.text
        }
        return {
            run,
            terminate: scheduler.terminate
        }
    }

    function converterAWSTextract() {
        const textract = new AWSTextract.TextractClient({ region: 'eu-west-1' })
        const run = async item => {
            const detect = new AWSTextract.DetectDocumentTextCommand({
                Document: {
                    Bytes: await FSExtra.readFile(`${origin}/${item.root}/${item.pagefile}`)
                }
            })
            const response = await textract.send(detect)
            const text = response.Blocks.filter(block => block.BlockType == 'LINE').map(block => block.Text).join(' ')
            return text
        }
        return {
            run,
            terminate: () => {} // for consistency
        }
    }

    async function write(item) {
        await FSExtra.writeFile(`${destination}/${item.root}/${item.pagefile.replace(/jpeg$/, 'txt')}`, item.text)
        return true
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const converters = {
            'aws-textract': converterAWSTextract,
            library: converterLibrary,
            shell: converterShell
        }
        const converter = await converters[method]()
        const convert = async item => {
            const exists = await FSExtra.pathExists(`${destination}/${item.root}/${item.pagefile}`)
            if (exists) return true
            await FSExtra.ensureDir(`${destination}/${item.root}`)
            try {
                const result = await converter.run(item)
                const text = result.replace(/\s+/g, ' ')
                return { ...item, text }
            }
            catch (e) {
                console.error(`Error: ${e.message} (retrying...)`)
                if (verbose) console.error(e.stack)
                return convert(item)
            }
        }
        const source = () => Scramjet.DataStream.from(Globby.globbyStream('**', { cwd: origin, deep: 2 })).map(path => {
            const [root, pagefile] = path.split('/')
            return { root, pagefile }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => {
            if (method === 'aws') return source().setOptions({ maxParallel: 1 }).rate(1).map(convert).map(write)
            return source().map(convert).map(write)
        }
        return { run, length, terminate: converter.terminate }
    }

    return setup()

}

export default initialise
