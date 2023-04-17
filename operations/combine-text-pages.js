import Path from 'path'
import FSExtra from 'fs-extra'
import shared from '../shared.js'

async function initialise(origin, originPages, destination, parameters, alert) {

    const operation = 'combine-text-pages'
    const options = {
        useCache: false,
        ...parameters
    }
    const cache = await shared.caching(operation)
    const waypoint = shared.waypointWith(alert, cache)

    async function read(item) {
        if (item.skip) return item
        const outputExists = await FSExtra.exists(item.output)
        if (outputExists) {
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return { ...item, skip: true } // we can use cached output
        }
        const textPages = await Promise.all(item.pages.map(page => FSExtra.readFile(`${item.input}/${page}`, 'utf8')))
        const text = textPages.join(' ')
        await FSExtra.ensureDir(Path.dirname(item.output))
        await FSExtra.writeFile(item.output, text)
        waypoint({
            operation,
            input: item.input,
            output: item.output,
            message: 'done'
        })
        return item
    }

    async function listing(item) {
        if (item.skip) return item
        waypoint({
            operation,
            input: item.input,
            output: item.output,
            message: 'combining...'
        })
        const pagesUnsorted = await FSExtra.readdir(item.input)
        if (pagesUnsorted.length === 0) {
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'no pages found',
                importance: 'error'
            })
            return { ...item, skip: true } // no pages found to combine
        }
        if (options.originPrior) {
            const pagesPrior = await FSExtra.readdir(`${options.originPrior}/${item.name}`)
            if (pagesUnsorted.length < pagesPrior.length) {
                waypoint({
                    operation,
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
        waypoint({
            operation,
            input: item.input,
            output: item.output,
            message: `combining ${pages.length} pages...`
        })
        return { ...item, pages }
    }

    async function check(item) {
        if (options.useCache) {
            const cached = cache.existing.get(item.input)
            if (cached) {
                waypoint({
                    operation,
                    input: item.input,
                    output: item.output,
                    cached: true,
                    ...cached
                })
                return { ...item, skip: true }
            }
        }
        const outputExists = await FSExtra.exists(item.output)
        if (outputExists) {
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return { ...item, skip: true } // we can use cached output
        }
        const inputExists = await FSExtra.exists(item.input)
        if (!inputExists) {
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'no input'
            })
            return { ...item, skip: true } // exists in initial-origin but not origin
        }
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const source = () => shared.source(origin, destination, { originInput: originPages })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().unorder(check).unorder(listing).unorder(read)
        return { run, length }
    }

    return setup()

}

export default initialise
