import FSExtra from 'fs-extra'
import Shared from '../shared.js'

async function initialise(origin, alternative, destination, alert) {

    async function symlink(item) {
        if (item.skip) return item
        await FSExtra.ensureSymlink(item.input, item.output)
        alert({
            operation: 'symlink-missing',
            input: item.input,
            output: item.output,
            message: 'done'
        })
        return item
    }

    async function check(item) {
        const outputExists = await FSExtra.exists(item.output)
        if (outputExists) {
            alert({
                operation: 'symlink-missing',
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return { ...item, skip: true } // we can use cached output
        }
        const buffer = Buffer.alloc(5)
        await FSExtra.read(await FSExtra.open(item.input, 'r'), buffer, 0, 5)
        if (buffer.toString() != '%PDF-') {
            alert({
                operation: 'symlink-missing',
                input: item.input,
                output: item.output,
                message: 'not a valid PDF file'
            })
            return { ...item, skip: true } // not a valid PDF file
        }
        const alternativeExists = await FSExtra.exists(item.alternative)
        if (alternativeExists) {
            alert({
                operation: 'symlink-missing',
                input: item.input,
                output: item.output,
                message: 'alternative exists'
            })
            return { ...item, skip: true } // likely a tagged-text file exists
        }
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const source = () => Shared.source(origin, destination).unorder(entry => {
            return {
                ...entry,
                alternative: `${alternative}/${entry.name}` // symlink won't be created if this exists
            }
        })
        const run = () => source().unorder(check).unorder(symlink)
        const length = () => source().reduce(a => a + 1, 0)
        return { run, length }
    }

    return setup()

}

export default initialise
