import FSExtra from 'fs-extra'
import shared from '../shared.js'

async function initialise(input, alternative, output, parameters, tick, alert) {

    const operation = 'symlink-missing'
    const options = {
        useCache: false,
        ...parameters
    }
    const cache = await shared.caching(operation)
    const waypoint = shared.waypointWith(alert, cache)

    async function symlink(item) {
        if (item.skip) return item
        await FSExtra.ensureSymlink(item.input, item.output)
        waypoint({
            operation,
            input: item.input,
            output: item.output,
            message: 'done'
        })
        return item
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
        const buffer = Buffer.alloc(5)
        await FSExtra.read(await FSExtra.open(item.input, 'r'), buffer, 0, 5)
        if (buffer.toString() != '%PDF-') {
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'not a valid PDF file',
                importance: 'error'
            })
            return { ...item, skip: true } // not a valid PDF file
        }
        const alternativeExists = await FSExtra.exists(item.alternative)
        if (alternativeExists) {
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'alternative exists'
            })
            return { ...item, skip: true } // likely a tagged-text file exists
        }
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(output)
        const run = async item => {
            const itemLocated = {
                name: item.name,
                input: `${input}/${item.name}`,
                alternative: `${alternative}/${item.name}`,
                output: `${output}/${item.name}`
            }
            await symlink(await check(itemLocated))
            tick()
            return item
        }
        return { run }
    }

    return setup()

}

export default initialise
