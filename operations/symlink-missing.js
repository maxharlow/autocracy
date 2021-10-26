import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'

async function initialise(origin, intermediate, destination, verbose, alert) {

    async function symlink(item) {
        const intermediateExists = await FSExtra.exists(`${intermediate}/${item.name}`) // so tagged-text was found and extracted
        if (intermediateExists) {
            if (verbose) alert({
                operation: 'symlink-missing',
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return item
        }
        await FSExtra.ensureSymlink(item.input, item.output)
        if (verbose) alert({
            operation: 'symlink-missing',
            input: item.input,
            output: item.output,
            message: 'done'
        })
        return item
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
                    output: `${destination}/${entry.name}`
                }
            }).filter(x => x)
        }
        const run = () => source().unorder(symlink)
        const length = () => source().reduce(a => a + 1, 0)
        return { run, length }
    }

    return setup()

}

export default initialise
