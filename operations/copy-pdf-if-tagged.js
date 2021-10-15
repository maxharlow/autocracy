import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'
import PDF2Json from 'pdf2json'

async function initialise(origin, destination, method = 'shell', verbose, alert) {

    async function detectorShell() {
        const isInstalled = await Lookpath.lookpath('pdftotext')
        if (!isInstalled) throw new Error('Poppler not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `pdftotext "${origin}/${item.root}" -`
            if (verbose) alert(command)
            const result = await execute(command)
            return result.stdout.trim() !== ''
        }
        return { run }
    }

    function detectorLibrary(item) {
        const parser = new PDF2Json(null, true)
        const run = () => {
            return new Promise((resolve, reject) => {
                parser.on('pdfParser_dataError', reject)
                parser.on('pdfParser_dataReady', () => resolve(parser.getRawTextContent().trim() !== ''))
                parser.loadPDF(`${origin}/${item.root}`)
            })
        }
        return { run }
    }

    async function copyMaybe(item) {
        const detectors = {
            shell: detectorShell,
            library: detectorLibrary
        }
        const detector = await detectors[method]()
        const isTagged = await detector.run(item)
        if (isTagged) {
            const copyFrom = `${origin}/${item.root}`
            const copyTo = `${destination}/${item.root}`
            if (verbose) alert(`Copying ${copyFrom} to ${copyTo}...`)
            await FSExtra.copy(copyFrom, copyTo)
        }
        return null
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const source = () => Scramjet.DataStream.from(Globby.globbyStream('*', { cwd: origin, deep: 1 })).map(root => {
            return { root }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().map(copyMaybe)
        return { run, length }
    }

    return setup()

}

export default initialise
