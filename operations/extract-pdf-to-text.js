import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'

async function initialise(origin, destination, options = { method: 'shell' }, verbose, alert) {

    async function extractorShell() {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `mutool draw -F txt "${item.input}"`
            const result = await execute(command)
            const text = result.stdout.replace(/\s+/g, ' ')
            if (text.trim() === '') {
                if (verbose) alert({
                    operation: 'extract-pdf-to-text',
                    input: item.input,
                    output: item.output,
                    message: 'no text found'
                })
                return { ...item, skip: true }
            }
            await FSExtra.writeFile(item.output, text)
        }
        return { run }
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const extractors = {
            shell: extractorShell
        }
        const extractor = await extractors[options.method](destination)
        const extract = async item => {
            const outputExists = await FSExtra.exists(item.output)
            if (outputExists) {
                if (verbose) alert({
                    operation: 'extract-pdf-to-text',
                    input: item.input,
                    output: item.output,
                    message: 'output exists'
                })
                return { ...item, skip: true } // already exists, skip
            }
            if (verbose) alert({
                operation: 'extract-pdf-to-text',
                input: item.input,
                output: item.output,
                message: 'extracting...'
            })
            try {
                await extractor.run(item)
                if (verbose) alert({
                    operation: 'extract-pdf-to-text',
                    input: item.input,
                    output: item.output,
                    message: 'done'
                })
                return item
            }
            catch (e) {
                alert({
                    operation: 'extract-pdf-to-text',
                    input: item.input,
                    output: item.output,
                    message: e.message,
                    isError: true
                })
                return { ...item, skip: true } // failed with error
            }
        }
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
        const run = () => source().unorder(extract)
        return { run, length }
    }

    return setup()

}

export default initialise
