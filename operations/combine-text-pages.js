import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'

async function initialise(origin, destination, parameters, alert) {

    const options = {
        ...parameters
    }

    async function read(item) {
        if (item.skip) return item
        const outputExists = await FSExtra.exists(item.output)
        if (outputExists) {
            alert({
                operation: 'combine-text-pages',
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return { ...item, skip: true } // already exists, skip
        }
        const textPages = await Promise.all(item.pages.map(page => FSExtra.readFile(`${origin}/${item.name}/${page}`, 'utf8')))
        const text = textPages.join(' ')
        await FSExtra.writeFile(item.output, text)
        alert({
            operation: 'combine-text-pages',
            input: item.input,
            output: item.output,
            message: 'done'
        })
        return item
    }

    async function listing(item) {
        if (item.skip) return item
        alert({
            operation: 'combine-text-pages',
            input: item.input,
            output: item.output,
            message: 'combining...'
        })
        const pagesUnsorted = await FSExtra.readdir(item.input)
        if (pagesUnsorted.length === 0) {
            alert({
                operation: 'combine-text-pages',
                input: item.input,
                output: item.output,
                message: 'no pages found',
                importance: 'error'
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
                    importance: 'error'
                })
                return { ...item, skip: true } // don't combine an incomplete set of pages
            }
        }
        const pages = pagesUnsorted.sort((a, b) => {
            return Number(a.replace(/[^0-9]/g, '')) - Number(b.replace(/[^0-9]/g, ''))
        })
        alert({
            operation: 'combine-text-pages',
            input: item.input,
            output: item.output,
            message: `combining ${pages.length} pages...`
        })
        return { ...item, pages }
    }

    async function check(item) {
        const inputExists = await FSExtra.exists(item.input)
        if (!inputExists) {
            alert({
                operation: 'combine-text-pages',
                input: item.input,
                output: item.output,
                message: 'no input'
            })
            return { ...item, skip: true } // no file to combine, skip
        }
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const source = () => {
            const listing = FSExtra.opendir(options.originInitial || origin)
            return Scramjet.DataStream.from(listing).map(entry => {
                if (!entry.isFile()) return
                return {
                    name: entry.name,
                    input: `${origin}/${entry.name}`,
                    output: `${destination}/${entry.name}`
                }
            }).filter(x => x)
        }
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().unorder(check).unorder(listing).unorder(read)
        return { run, length }
    }

    return setup()

}

export default initialise
