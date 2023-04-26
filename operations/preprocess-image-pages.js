import FSExtra from 'fs-extra'
import * as Tempy from 'tempy'
import Scramjet from 'scramjet'
import Sharp from 'sharp'
import shared from '../shared.js'

async function initialise(input, output, parameters, tick, alert) {

    const operation = 'preprocess-image-pages'
    const options = {
        useCache: false,
        ...parameters
    }
    const cache = await shared.caching(operation)
    const waypoint = shared.waypointWith(alert, cache)

    async function preprocess(page) {
        if (page.skip) return page
        waypoint({
            operation,
            input: page.input,
            output: page.output,
            message: 'preprocessing...'
        })
        const result = Tempy.temporaryFile()
        try {
            await Sharp(page.input)
                .threshold(100)
                .toFile(result)
            await FSExtra.move(result, page.output)
            waypoint({
                operation,
                input: page.input,
                output: page.output,
                message: 'done'
            })
            return page
        }
        catch (e) {
            waypoint({
                operation,
                input: page.input,
                output: page.output,
                message: e.message,
                importance: 'error'
            })
            return { ...page, skip: true } // execution failed with message
        }
    }

    async function check(page) {
        if (options.useCache) {
            const cached = cache.existing.get(page.input)
            if (cached) {
                waypoint({
                    operation,
                    input: page.input,
                    output: page.output,
                    cached: true,
                    ...cached
                })
                return { ...page, skip: true }
            }
        }
        const outputExists = await FSExtra.exists(page.output)
        if (outputExists) {
            waypoint({
                operation,
                input: page.input,
                output: page.output,
                message: 'output exists'
            })
            return { ...page, skip: true } // we can use cached output
        }
        const inputExists = await FSExtra.exists(page.input)
        if (!inputExists) {
            waypoint({
                operation,
                input: page.input,
                output: page.output,
                message: 'no input'
            })
            return { ...page, skip: true } // exists in initial-origin but not origin
        }
        return page
    }

    async function paged(item) {
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
                return []
            }
        }
        const inputExists = await FSExtra.exists(`${input}/${item.name}`)
        if (!inputExists) {
            waypoint({
                operation,
                input: `${input}/${item.name}`,
                output: `${output}/${item.name}`,
                message: 'no input directory'
            })
            return []
        }
        const pages = await FSExtra.readdir(`${input}/${item.name}`)
        return pages.map(page => {
            return {
                name: `${item.name}/${page}`,
                input: `${input}/${item.name}/${page}`,
                output: `${output}/${item.name}/${page}`
            }
        })
    }

    async function setup() {
        await FSExtra.ensureDir(output)
        const run = async item => {
            const pages = await paged(item)
            await Scramjet.DataStream.from(pages).map(check).map(preprocess).run()
            tick()
            return item
        }
        return { run }
    }

    return setup()

}

export default initialise
