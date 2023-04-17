import Util from 'util'
import FSExtra from 'fs-extra'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'
import Shared from '../shared.js'

async function initialise(origin, destination, parameters, alert) {

    const options = {
        method: 'mupdf',
        ...parameters
    }

    async function detectorMuPDF() {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const escaped = path => path.replaceAll('"', '\\"')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `mutool draw -F txt "${escaped(item.input)}"`
            try {
                const result = await execute(command)
                return result.stdout.trim() !== ''
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

    async function copyMaybe(item) {
        if (item.skip) return item
        const methods = {
            mupdf: detectorMuPDF
        }
        const method = await methods[options.method]()
        const isTagged = await method(item)
        if (isTagged) {
            await FSExtra.copy(item.input, item.output)
            alert({
                operation: 'copy-pdf-tagged',
                input: item.input,
                output: item.output,
                message: 'done'
            })
        }
        else alert({
            operation: 'copy-pdf-tagged',
            input: item.input,
            output: item.output,
            message: 'not tagged'
        })
        return { ...item, skip: true } // doesn't have tagged-text
    }

    async function check(item) {
        const buffer = Buffer.alloc(5)
        await FSExtra.read(await FSExtra.open(item.input, 'r'), buffer, 0, 5)
        if (buffer.toString() != '%PDF-') {
            alert({
                operation: 'copy-pdf-tagged',
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
        const source = () => Shared.source(origin, destination)
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().unorder(check).unorder(copyMaybe)
        return { run, length }
    }

    return setup()

}

export default initialise
