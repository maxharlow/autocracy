import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'

async function initialise(origin, destination, verbose, alert) {

    async function listing(item) {
        const pages = await Globby.globby(`${origin}/${item.root}`)
        if (pages.length === 0) {
            alert(`No page files found for ${item.root}!`)
            return null
        }
        return {
            root: item.root,
            pages
        }
    }

    async function read(item) {
        const exists = await FSExtra.exists(`${destination}/${item.root}`)
        if (exists) return null // already exists, skip
        const texts = await Promise.all(item.pages.map(file => FSExtra.readFile(file, 'utf8')))
        return {
            root: item.root,
            text: texts.join(' ')
        }
    }

    async function write(item) {
        if (!item) return null // skipped file
        await FSExtra.writeFile(`${destination}/${item.root}`, item.text)
        return null
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const source = () => Scramjet.DataStream.from(Globby.globbyStream('*', { cwd: origin, deep: 1, onlyFiles: false })).map(root => {
            return { root }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().map(listing).map(read).map(write)
        return { run, length }
    }

    return setup()

}

export default initialise
