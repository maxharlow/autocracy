import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'

async function initialise(origin, destination, parameters, alert) {

    const options = {
        method: 'shell',
        ...parameters
    }

    async function extractorShell() {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const escaped = path => path.replaceAll('"', '\\"')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `mutool draw -F txt "${escaped(item.input)}"`
            try {
                const result = await execute(command)
                const text = result.stdout.replace(/\s+/g, ' ')
                if (text.trim() === '') {
                    alert({
                        operation: 'extract-pdf-to-text',
                        input: item.input,
                        output: item.output,
                        message: 'no text found'
                    })
                    return { ...item, skip: true }
                }
                await FSExtra.writeFile(item.output, text)
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
            shell: extractorShell
        }
        const method = await methods[options.method]()
        const run = async item => {
            if (item.skip) return item
            alert({
                operation: 'extract-pdf-to-text',
                input: item.input,
                output: item.output,
                message: 'extracting...'
            })
            try {
                await method(item)
                alert({
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
                    importance: 'error'
                })
                return { ...item, skip: true } // failed with error
            }
        }
        return run
    }

    async function check(item) {
        const outputExists = await FSExtra.exists(item.output)
        if (outputExists) {
            alert({
                operation: 'extract-pdf-to-text',
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return { ...item, skip: true } // already exists, skip
        }
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const extractor = await extract()
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
        const run = () => source().unorder(check).unorder(extractor)
        return { run, length }
    }

    return setup()

}

export default initialise
