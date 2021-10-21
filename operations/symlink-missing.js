import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'

async function initialise(origin, intermediate, destination, verbose, alert) {

    async function symlink(item) {
        const intermediateExists = await FSExtra.exists(`${intermediate}/${item.name}`) // so tagged-text was found and extracted
        if (!intermediateExists) {
            await FSExtra.ensureSymlink(item.input, item.output)
            if (verbose) alert({
                operation: 'symlink-missing',
                input: item.input,
                output: item.output,
                message: 'done'
            })
        }
        else if (verbose) alert({
            operation: 'symlink-missing',
            input: item.input,
            output: item.output,
            message: 'output exists'
        })
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
                name: file.name,
                input: `${origin}/${file.name}`,
                output: `${destination}/${file.name}`
            }
        })
        const run = () => source().map(symlink)
        const length = () => source().reduce(a => a + 1, 0)
        return { run, length }
    }

    return setup()

}

export default initialise
