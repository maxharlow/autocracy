import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import ChildProcess from 'child_process'
import PDF2JSON from 'pdf2json'

async function extractorLibrary() {
    const run = async item => {
        const parser = new PDF2JSON(null, true)
        const result = await new Promise((resolve, reject) => {
            parser.on('pdfParser_dataError', reject)
            parser.on('pdfParser_dataReady', () => resolve(parser.getRawTextContent()))
            parser.loadPDF(item.filepath)
        })
        return result
    }
    return { run }
}

function extractorShell() {
    const execute = Util.promisify(ChildProcess.exec)
    const run = async item => {
        const result = await execute(`pdftotext ${item.filepath} -`)
        return result.stdout
    }
    return { run }
}

async function setup(origin, destination, method = 'shell') {
    await FSExtra.ensureDir(destination)
    const extractors = {
        shell: extractorShell,
        library: extractorLibrary
    }
    const extractor = await extractors[method](destination)
    const write = async item => {
        await FSExtra.writeFile(`${destination}/${item.filename}`, item.text)
        return true
    }
    const extract = async item => {
        const path = `${destination}/${item.filename}`
        const exists = await FSExtra.pathExists(path)
        if (exists) return
        try {
            const result = await extractor.run(item)
            const text = result.replace(/\s+/g, ' ')
            return { ...item, text }
        }
        catch (e) {
            console.error(`Error: ${e.message} (retrying...)`)
            return extract(item)
        }
    }
    const source = () => Scramjet.DataStream.from(Globby.globbyStream('*', { cwd: origin, deep: 1 })).map(filename => {
        return {
            filename,
            filepath: `${origin}/${filename}`
        }
    })
    const length = () => source().reduce(a => a + 1, 0)
    const run = () => source().setOptions({ maxParallel: 1 }).map(extract).each(write)
    return { run, length }
}

export default setup
