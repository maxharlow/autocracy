import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'

async function initialise(origin, destination, verbose, alert) {

    async function listing(item) {
        const files = await Globby.globby('*', { cwd: `${origin}/${item.root}` })
        return {
            root: item.root,
            files: files.map(file => `${origin}/${item.root}/${file}`)
        }
    }

    async function read(item) {
        const texts = await Promise.all(item.files.map(file => FSExtra.readFile(file, 'utf8')))
        return {
            root: item.root,
            text: texts.join(' ')
        }
    }

    const write = async item => {
        await FSExtra.writeFile(`${destination}/${item.root}`, item.text)
        return true
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
