import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'

async function initialise(origin, destination, options = {}, verbose, alert) {

    async function listing(item) {
        if (verbose) alert({
            operation: 'combine-text-pages',
            input: item.input,
            output: item.output,
            message: 'combining...'
        })
        const inputExists = await FSExtra.exists(item.input)
        if (!inputExists) {
            if (verbose) alert({
                operation: 'combine-text-pages',
                input: item.input,
                output: item.output,
                message: 'no input'
            })
            return { ...item, skip: true } // no file to combine, skip
        }
        const pagesUnsorted = await FSExtra.readdir(item.input)
        if (pagesUnsorted.length === 0) {
            if (verbose) alert({
                operation: 'combine-text-pages',
                input: item.input,
                output: item.output,
                message: 'no pages found',
                isError: true
            })
            return { ...item, skip: true } // no pages found to combine, skip
        }
        if (options.originPrior) {
            const pagesPrior = await FSExtra.readdir(`${options.originPrior}/${item.name}`)
            if (pagesUnsorted.length < pagesPrior.length) {
                alert({
                    operation: 'combine-text-pages',
                    input: item.input,
                    output: item.output,
                    message: 'pagefiles missing',
                    isError: true
                })
                return { ...item, skip: true } // don't combine an incomplete set of pages
            }
        }
        const pages = pagesUnsorted.sort((a, b) => {
            return Number(a.replace(/[^0-9]/g, '')) - Number(b.replace(/[^0-9]/g, ''))
        })
        if (verbose) alert({
            operation: 'combine-text-pages',
            input: item.input,
            output: item.output,
            message: `combining ${pages.length} pages...`
        })
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
            return { ...item, skip: true } // already exists, skip
        }
        const textPages = await Promise.all(item.pages.map(page => FSExtra.readFile(`${origin}/${item.name}/${page}`, 'utf8')))
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
        const source = () => {
            const listing = FSExtra.opendir(options.originInitial || origin)
            return Scramjet.DataStream.from(listing).map(file => {
                return {
                    name: file.name,
                    input: `${origin}/${file.name}`,
                    output: `${destination}/${file.name}`
                }
            })
        }
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().unorder(listing).unorder(read).unorder(write)
        return { run, length }
    }

    return setup()

}

export default initialise
