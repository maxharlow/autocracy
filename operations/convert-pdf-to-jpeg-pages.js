import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'

async function initialise(origin, destination, options = { method: 'shell', density: 300 }, verbose, alert) {

    async function converterShell(destination) {
        const isInstalled = await Lookpath.lookpath('magick')
        const isInstalledLegacy = await Lookpath.lookpath('convert')
        if (!isInstalled && !isInstalledLegacy) throw new Error('ImageMagick not found!')
        const executable = !isInstalled ? 'convert' : 'magick convert'
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `${executable} -density ${options.density} "pdf:${origin}/${item.root}" "${destination}/${item.root}/page-%04d.jpeg"`
            if (verbose) alert(command)
            await execute(command)
        }
        return { run }
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const converters = {
            shell: converterShell
        }
        const converter = await converters[options.method](destination)
        const convert = async item => {
            const outputExists = await FSExtra.exists(`${destination}/${item.root}`)
            if (outputExists) return { item, skip: true } // already exists, skip
            const inputExists = await FSExtra.exists(`${origin}/${item.root}`)
            if (!inputExists) return { item, skip: true } // no input, skip
            await FSExtra.mkdir(`${destination}/${item.root}`)
            try {
                await converter.run(item)
                return item
            }
            catch (e) {
                console.error(`Error: ${e.message} (retrying...)`)
                await FSExtra.remove(`${destination}/${item.root}`) // so we don't trigger the exists check and skip
                if (verbose) console.error(e.stack)
                return convert(item)
            }
        }
        const sourceGenerator = () => Globby.globbyStream(options.originInitial || origin, {
            objectMode: true,
            deep: 1
        })
        const source = () => Scramjet.DataStream.from(sourceGenerator()).map(file => {
            return {
                root: file.name
            }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().map(convert)
        return { run, length }
    }

    return setup()

}

export default initialise
