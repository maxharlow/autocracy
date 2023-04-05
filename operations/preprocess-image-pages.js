import FSExtra from 'fs-extra'
import * as Tempy from 'tempy'
import Sharp from 'sharp'
import Shared from '../shared.js'

async function initialise(origin, destination, parameters, alert) {

    const options = {
        ...parameters
    }

    async function preprocess(item) {
        if (item.skip) return item
        await FSExtra.ensureDir(`${destination}/${item.name}`)
        alert({
            operation: 'preprocess-image-pages',
            input: item.input,
            output: item.output,
            message: 'preprocessing...'
        })
        const output = Tempy.temporaryFile()
        try {
            await Sharp(item.input)
                .threshold(100)
                .toFile(output)
            await FSExtra.move(output, item.output)
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
            return { ...item, skip: true } // execution failed with message
        }
    }

    async function check(item) {
        const outputExists = await FSExtra.exists(item.output)
        if (outputExists) {
            alert({
                operation: 'preprocess-image-pages',
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return { ...item, skip: true } // we can use cached output
        }
        const inputExists = await FSExtra.exists(item.input)
        if (!inputExists) {
            alert({
                operation: 'preprocess-image-pages',
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
        const source = () => Shared.source(origin, destination, { paged: true })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().unorder(check).unorder(preprocess)
        return { run, length }
    }

    return setup()

}

export default initialise
