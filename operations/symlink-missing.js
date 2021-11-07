import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'

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
        const source = () => {
            const listing = FSExtra.opendir(origin)
            return Scramjet.DataStream.from(listing).map(entry => {
                if (!entry.isFile()) return
                return {
                    name: entry.name,
                    input: `${origin}/${entry.name}`,
                    alternative: `${alternative}/${entry.name}`, // symlink won't be created if this exists
                    output: `${destination}/${entry.name}`
                }
            }).filter(x => x)
        }
        const run = () => source().unorder(check).unorder(symlink)
        const length = () => source().reduce(a => a + 1, 0)
        return { run, length }
    }

    return setup()

}

export default initialise
