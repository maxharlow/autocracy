import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import Sharp from 'sharp'

async function initialise(origin, destination, parameters, alert) {

    const options = {
        ...parameters
    }

    async function preprocess(item) {
        const outputExists = await FSExtra.exists(item.output)
        if (outputExists) {
            alert({
                operation: 'preprocess-image-pages',
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return { ...item, skip: true } // already exists, skip
        }
        const inputExists = await FSExtra.exists(item.input)
        if (!inputExists) {
            alert({
                operation: 'preprocess-image-pages',
                input: item.input,
                output: item.output,
                message: 'no input'
            })
            return { ...item, skip: true } // no input, skip
        }
        await FSExtra.ensureDir(`${destination}/${item.name}`)
        alert({
            operation: 'preprocess-image-pages',
            input: item.input,
            output: item.output,
            message: 'converting...'
        })
        try {
            await Sharp(item.input)
                .threshold()
                .toFile(item.output)
            alert({
                operation: 'preprocess-image-pages',
                input: item.input,
                output: item.output,
                message: 'done'
            })
            return item
        }
        catch (e) {
            alert({
                operation: 'preprocess-image-pages',
                input: item.input,
                output: item.output,
                message: e.message,
                importance: 'error'
            })
            return { ...item, skip: true } // failed with error
        }
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const source = () => {
            const listing = FSExtra.opendir(options.originInitial || origin)
            return Scramjet.DataStream.from(listing).flatMap(async entry => {
                const exists = await FSExtra.exists(`${origin}/${entry.name}`)
                if (!exists) return []
                const pages = await FSExtra.readdir(`${origin}/${entry.name}`, { withFileTypes: true })
                return pages.map(page => {
                    if (!page.isFile()) return
                    return {
                        name: entry.name,
                        input: `${origin}/${entry.name}/${page.name}`,
                        output: `${destination}/${entry.name}/${page.name}`
                    }
                }).filter(x => x)
            })
        }
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().unorder(preprocess)
        return { run, length }
    }

    return setup()

}

export default initialise
