import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import PDF from 'pdfjs'
import Lookpath from 'lookpath'
import Tempy from 'tempy'
import ChildProcess from 'child_process'

async function initialise(origin, destination, parameters, alert) {

    const options = {
        method: 'shell',
        ...parameters
    }

    async function combinerShell() {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const escaped = path => path.replaceAll('"', '\\"')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const output = Tempy.file()
            const pagesList = item.pages.map(page => `"${escaped(item.input)}/${page}"`).join(' ')
            const command = `mutool merge -o ${output} ${pagesList}`
            try {
                await execute(command)
                await FSExtra.move(output, item.output)
            }
            catch (e) {
                await FSExtra.remove(output)
                const message = e.message.trim()
                    .split('\n')
                    .filter(line => !line.match(/Command failed:|warning:|aborting process/))
                    .map(line => line.replace('error: ', ''))
                    .join(', ')
                    .toLowerCase()
                throw new Error(message)
            }
        }
        return run
    }

    async function combinerLibrary() {
        const run = async item => {
            const document = new PDF.Document()
            await item.pages.reduce(async (previous, page) => {
                await previous
                const pageData = await FSExtra.readFile(`${origin}/${item.name}/${page}`)
                const pageDocument = new PDF.ExternalDocument(pageData)
                document.addPagesOf(pageDocument)
            }, Promise.resolve())
            const data = document.asBuffer()
            await FSExtra.writeFile(item.output, data)
        }
        return run
    }

    async function combiner() {
        const methods = {
            shell: combinerShell,
            library: combinerLibrary // slightly slower, has a 2GB limit for output files
        }
        const method = await methods[options.method]()
        const run = async item => {
            if (item.skip) return item
            alert({
                operation: 'combine-pdf-pages',
                input: item.input,
                output: item.output,
                message: `combining ${item.pages.length} pages...`
            })
            try {
                await method(item)
                alert({
                    operation: 'combine-pdf-pages',
                    input: item.input,
                    output: item.output,
                    message: 'done'
                })
                return item
            }
            catch (e) {
                alert({
                    operation: 'combine-pdf-pages',
                    input: item.input,
                    output: item.output,
                    message: e.message,
                    importance: 'error'
                })
                return { ...item, skip: true } // failed with error
            }
        }
        return run
    }

    async function listing(item) {
        if (item.skip) return item
        const pagesUnsorted = await FSExtra.readdir(item.input)
        if (pagesUnsorted.length === 0) {
            alert({
                operation: 'combine-pdf-pages',
                input: item.input,
                output: item.output,
                message: 'no pages found',
                importance: 'error'
            })
            return { ...item, skip: true } // no pages found to combine, skip
        }
        if (options.originPrior) {
            const pagesPrior = await FSExtra.readdir(`${options.originPrior}/${item.name}`)
            if (pagesUnsorted.length < pagesPrior.length) {
                alert({
                    operation: 'combine-pdf-pages',
                    input: item.input,
                    output: item.output,
                    message: 'pagefiles missing',
                    importance: 'error'
                })
                return { ...item, skip: true } // don't combine an incomplete set of pages
            }
        }
        const pages = pagesUnsorted.sort((a, b) => {
            return Number(a.replace(/[^0-9]/g, '')) - Number(b.replace(/[^0-9]/g, ''))
        })
        return { ...item, pages }
    }

    async function check(item) {
        const outputExists = await FSExtra.exists(item.output)
        if (outputExists) {
            alert({
                operation: 'combine-pdf-pages',
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return { ...item, skip: true } // already exists, skip
        }
        const inputExists = await FSExtra.exists(item.input)
        if (!inputExists) {
            alert({
                operation: 'combine-pdf-pages',
                input: item.input,
                output: item.output,
                message: 'no input'
            })
            return { ...item, skip: true } // no input, skip
        }
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const combine = await combiner()
        const source = () => {
            const listing = FSExtra.opendir(options.originInitial || origin)
            return Scramjet.DataStream.from(listing).map(entry => {
                if (!entry.isFile()) return
                return {
                    name: entry.name,
                    input: `${origin}/${entry.name}`,
                    output: `${destination}/${entry.name}`
                }
            }).filter(x => x)
        }
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().unorder(check).unorder(listing).unorder(combine)
        return { run, length }
    }

    return setup()

}

export default initialise
