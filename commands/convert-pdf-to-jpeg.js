import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'
// import MagickWasm from '@imagemagick/magick-wasm'

async function initialise(origin, destination, method = 'shell', density = 300, verbose, alert) {

    async function converterShell(destination) {
        const isInstalled = await Lookpath.lookpath('magick')
        const isInstalledLegacy = await Lookpath.lookpath('convert')
        if (!isInstalled && !isInstalledLegacy) throw new Error('ImageMagick not found!')
        const executable = isInstalledLegacy ? 'convert' : 'magick convert'
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `${executable} -density ${density} pdf:${item.filepath} ${destination}/${item.filename}/page-%04d.jpeg`
            if (verbose) alert(command)
            await execute(command)
        }
        return { run }
    }

    async function converterLibrary(destination) {
        // await MagickWasm.initializeImageMagick()
        const run = async item => {
            // todo
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
