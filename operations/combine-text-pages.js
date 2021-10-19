import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'

async function initialise(origin, destination, options = {}, verbose, alert) {

    async function listing(item) {
        const pages = await Globby.globby(`${origin}/${item.name}`)
        if (pages.length === 0) return { item, skip: true } // no pages found to combine, skip
        return {
            name: item.name,
            pages
        }
    }

    async function read(item) {
        if (item.skip) return item
        const outputExists = await FSExtra.exists(`${destination}/${item.name}`)
        if (outputExists) return { item, skip: true } // already exists, skip
        const texts = await Promise.all(item.pages.map(file => FSExtra.readFile(file, 'utf8')))
        return {
            name: item.name,
            text: texts.join(' ')
        }
    }

    async function write(item) {
        if (item.skip) return item
        await FSExtra.writeFile(`${destination}/${item.name}`, item.text)
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
                name: file.name
            }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().map(listing).map(read).map(write)
        return { run, length }
    }

    return setup()

}

export default initialise
