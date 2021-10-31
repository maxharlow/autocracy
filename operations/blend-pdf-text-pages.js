import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import Lookpath from 'lookpath'
import Tempy from 'tempy'
import ChildProcess from 'child_process'

async function initialise(origin, originText, destination, parameters, alert) {

    const options = {
        method: 'shell',
        ...parameters
    }

    async function blenderShell() {
        const isInstalled = await Lookpath.lookpath('QPDF')
        if (!isInstalled) throw new Error('QPDF not found!')
        const escaped = path => path.replaceAll('"', '\\"')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const output = Tempy.file()
            const command = `qpdf "${escaped(item.inputText)}" --overlay "${escaped(item.input)}" -- ${output}`
            try {
                await execute(command)
                await FSExtra.move(output, item.output)
            }
            catch (e) {
                await FSExtra.remove(output)
                const message = e.message.trim()
                    .split('\n')
                    .find(line => line.match('qpdf:'))
                    .replace('qpdf: ', '')
                    .toLowerCase()
                throw new Error(message)
            }
        }
        return { run }
    }

    async function blend(item) {
        const blenders = {
            shell: blenderShell
        }
        const blender = await blenders[options.method]()
        const outputExists = await FSExtra.exists(item.output)
        if (outputExists) {
            alert({
                operation: 'blend-pdf-text-pages',
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return { ...item, skip: true } // already exists, skip
        }
        alert({
            operation: 'blend-pdf-text-pages',
            input: item.input,
            output: item.output,
            message: 'blending...'
        })
        try {
            await blender.run(item)
            alert({
                operation: 'blend-pdf-text-pages',
                input: item.input,
                output: item.output,
                message: 'done'
            })
            return item
        }
        catch (e) {
            alert({
                operation: 'blend-pdf-text-pages',
                input: item.input,
                output: item.output,
                message: e.message,
                importance: 'error'
            })
            return { ...item, skip: true } // failed with error
        }
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const source = () => {
            const listing = FSExtra.opendir(origin)
            return Scramjet.DataStream.from(listing).map(entry => {
                if (!entry.isFile()) return
                return {
                    name: entry.name,
                    input: `${origin}/${entry.name}`,
                    inputText: `${originText}/${entry.name}`,
                    output: `${destination}/${entry.name}`
                }
            }).filter(x => x)
        }
        const run = () => source().unorder(blend)
        const length = () => source().reduce(a => a + 1, 0)
        return { run, length }
    }

    return setup()

}

export default initialise
