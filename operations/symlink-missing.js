import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'

async function initialise(origin, intermediate, destination, verbose, alert) {

    async function symlink(item) {
        const outputExists = await FSExtra.exists(`${intermediate}/${item.root}`) // so tagged-text was found and extracted
        if (!outputExists) {
            const symlinkFrom = `${origin}/${item.root}`
            const symlinkTo = `${destination}/${item.root}`
            if (verbose) alert(`Symlinking ${symlinkFrom} to ${symlinkTo}...`)
            await FSExtra.ensureSymlink(symlinkFrom, symlinkTo)
        }
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const sourceGenerator = () => Globby.globbyStream(origin, {
            objectMode: true,
            deep: 1
        })
        const source = () => Scramjet.DataStream.from(sourceGenerator()).map(file => {
            return {
                root: file.name
            }
        })
        const run = () => source().map(symlink)
        const length = () => source().reduce(a => a + 1, 0)
        return { run, length }
    }

    return setup()

}

export default initialise
