import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
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
            return result.stdout
        }
        return { run }
    }

    async function write(item) {
        if (item.skip) return item
        if (item.text.trim() === '') {
            if (verbose) alert({
                operation: 'extract-pdf-to-text',
                input: item.input,
                output: item.output,
                message: 'no text found'
            })
            return { ...item, skip: true } // don't write empty files
        }
        await FSExtra.writeFile(item.output, item.text)
        if (verbose) alert({
            operation: 'extract-pdf-to-text',
            input: item.input,
            output: item.output,
            message: 'done'
        })
        return item
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
                const result = await extractor.run(item)
                const text = result.replace(/\s+/g, ' ')
                return { ...item, text }
            }
            catch (e) {
                alert({
                    operation: 'extract-pdf-to-text',
                    input: item.input,
                    output: item.output,
                    message: e.message
                })
                return extract(item)
            }
        }
        const sourceGenerator = () => Globby.globbyStream(origin, {
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
        const run = () => source().map(extract).map(write)
        return { run, length }
    }

    return setup()

}

export default initialise
