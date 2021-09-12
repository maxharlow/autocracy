import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import ocracy from './../ocracy.js'

async function initialise(origin, destination, verbose, alert) {

    async function runSymlinkUntagged(from, to) {
        await FSExtra.ensureDir(to)
        const symlink = async item => {
            const exists = await FSExtra.exists(`${from}/${item.root}`) // so tagged-text was found and extracted
            if (!exists) {
                const symlinkFrom = `${origin}/${item.root}`
                const symlinkTo = `${to}/${item.root}`
                if (verbose) alert(`Symlinking ${symlinkFrom} to ${symlinkTo}...`)
                await FSExtra.ensureSymlink(symlinkFrom, symlinkTo)
            }
            return true
        }
        const source = () => Scramjet.DataStream.from(Globby.globbyStream('*', { cwd: origin, deep: 1 })).map(root => {
            return { root }
        })
        const run = () => source().map(symlink)
        const length = () => source().reduce(a => a + 1, 0)
        return { run, length }
    }

    async function setup() {
        return [
            {
                name: 'Extracting PDF to text',
                setup: () => ocracy.extractPDFToText(origin, destination, 'shell', verbose, alert)
            },
            {
                name: 'Symlinking untagged PDFs',
                setup: () => runSymlinkUntagged(destination, '.ocracy-cache/untagged')
            },
            {
                name: 'Converting untagged PDFs to JPEG pages',
                setup: () => ocracy.convertPDFToJPEGPages('.ocracy-cache/untagged', '.ocracy-cache/untagged-image-pages', 'shell', 300, verbose, alert)
            },
            {
                name: 'Converting JPEG pages to text pages',
                setup: () => ocracy.convertJPEGPagesToTextPages('.ocracy-cache/untagged-image-pages', '.ocracy-cache/untagged-text-pages', 'shell', verbose, alert)
            },
            {
                name: 'Combining text pages',
                setup: () => ocracy.combineTextPages('.ocracy-cache/untagged-text-pages', destination, verbose, alert)
            }
        ]
    }

    return setup()

}

export default initialise
