import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import ChildProcess from 'child_process'

function converterShell(destination) {
    const execute = Util.promisify(ChildProcess.exec)
    const run = async item => {
        await execute(`magick convert -density 300 pdf:${item.filepath} ${destination}/${item.filename}/page-%04d.jpeg`)
    }
    return { run }
}

async function setup(origin, destination, method = 'shell') {
    await FSExtra.ensureDir(destination)
    const converters = {
        shell: converterShell
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

export default setup
