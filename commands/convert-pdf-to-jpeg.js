import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import ChildProcess from 'child_process'
// import MagickWasm from '@imagemagick/magick-wasm'

async function initialise(origin, destination, method = 'shell', verbose, alert) {

    async function converterLibrary(destination) {
        // await MagickWasm.initializeImageMagick()
        const run = async item => {
            // todo
        }
        return { run }
    }

    function converterShell(destination) {
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `magick convert -density 300 pdf:${item.filepath} ${destination}/${item.filename}/page-%04d.jpeg`
            if (verbose) alert(command)
            await execute(command)
        }
        return { run }
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const converters = {
            shell: converterShell,
            library: converterLibrary
        }
        const converter = await converters[method](destination)
        const convert = async item => {
            const path = `${destination}/${item.filename}`
            const exists = await FSExtra.pathExists(path)
            if (exists) return true
            await FSExtra.mkdir(path)
            try {
                await converter.run(item)
            }
            catch (e) {
                console.error(`Error: ${e.message} (retrying...)`)
                return convert(item)
            }
            return true
        }
        const source = () => Scramjet.DataStream.from(Globby.globbyStream('*', { cwd: origin, deep: 1 })).map(filename => {
            return {
                filename,
                filepath: `${origin}/${filename}`
            }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().map(convert)
        return { run, length }
    }

    return setup()

}

export default initialise
