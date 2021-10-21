import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'

async function initialise(origin, destination, options = {}, verbose, alert) {

    async function listing(item) {
        if (verbose) alert({
            operation: 'combine-text-pages',
            input: item.input,
            output: item.output,
            message: 'combining...'
        })
        const pages = await Globby.globby(item.input)
        if (pages.length === 0) {
            if (verbose) alert({
                operation: 'combine-text-pages',
                input: item.input,
                output: item.output,
                message: 'no pages found'
            })
            return { item, skip: true } // no pages found to combine, skip
        }
        return { ...item, pages }
    }

    async function read(item) {
        if (item.skip) return item
        const outputExists = await FSExtra.exists(item.output)
        if (outputExists) {
            if (verbose) alert({
                operation: 'combine-text-pages',
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return { item, skip: true } // already exists, skip
        }
        const textPages = await Promise.all(item.pages.map(file => FSExtra.readFile(file, 'utf8')))
        const text = textPages.join(' ')
        return { ...item, text }
    }

    async function write(item) {
        if (item.skip) return item
        await FSExtra.writeFile(item.output, item.text)
        if (verbose) alert({
            operation: 'combine-text-pages',
            input: item.input,
            output: item.output,
            message: 'done'
        })
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const sourceGenerator = () => Globby.globbyStream(options.originInitial || origin, {
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
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().map(listing).map(read).map(write)
        return { run, length }
    }

    return setup()

}

export default initialise
