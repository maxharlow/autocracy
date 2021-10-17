import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'

async function initialise(origin, intermediate, destination, verbose, alert) {

    async function symlink(item) {
        const exists = await FSExtra.exists(`${intermediate}/${item.root}`) // so tagged-text was found and extracted
        if (!exists) {
            const symlinkFrom = `${origin}/${item.root}`
            const symlinkTo = `${destination}/${item.root}`
            if (verbose) alert(`Symlinking ${symlinkFrom} to ${symlinkTo}...`)
            await FSExtra.ensureSymlink(symlinkFrom, symlinkTo)
        }
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const source = () => Scramjet.DataStream.from(Globby.globbyStream('*', { cwd: origin, deep: 1 })).map(root => {
            return { root }
        })
        const run = () => source().map(symlink)
        const length = () => source().reduce(a => a + 1, 0)
        return { run, length }
    }

    return setup()

}

export default initialise
