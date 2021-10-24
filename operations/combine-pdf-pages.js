import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import PDF from 'pdfjs'
import Lookpath from 'lookpath'
import Tempy from 'tempy'
import ChildProcess from 'child_process'

async function initialise(origin, destination, options = { method: 'shell' }, verbose, alert) {

    async function listing(item) {
        const inputExists = await FSExtra.exists(item.input)
        if (!inputExists) {
            if (verbose) alert({
                operation: 'combine-pdf-pages',
                input: item.input,
                output: item.output,
                message: 'no input'
            })
            return { ...item, skip: true } // no input, skip
        }
        const pagesUnsorted = await FSExtra.readdir(item.input)
        if (pagesUnsorted.length === 0) {
            if (verbose) alert({
                operation: 'combine-pdf-pages',
                input: item.input,
                output: item.output,
                message: 'no pages found',
                isError: true
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
                    isError: true
                })
                return { ...item, skip: true } // don't combine an incomplete set of pages
            }
        }
        const pages = pagesUnsorted.sort((a, b) => {
            return Number(a.replace(/[^0-9]/g, '')) - Number(b.replace(/[^0-9]/g, ''))
        })
        if (verbose) alert({
            operation: 'combine-pdf-pages',
            input: item.input,
            output: item.output,
            message: `combining ${pages.length} pages...`
        })
        return { ...item, pages }
    }

    async function combinerShell() {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const pagesList = item.pages.map(page => `"${origin}/${item.name}/${page}"`).join(' ')
            const output = Tempy.file()
            const command = `mutool merge -o ${output} ${pagesList}`
            try {
                await execute(command)
                const data = await FSExtra.readFile(output)
                await FSExtra.remove(output)
                return data
            }
            catch (e) {
                await FSExtra.remove(output)
                const message = e.message.trim()
                    .split('\n')
                    .filter(line => !line.match(/Command failed:|warning:|aborting process/))
                    .map(line => line.replace('error: ', ''))
                    .join(', ')
                throw new Error(message)
            }
        }
        return { run }
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
            return document.asBuffer()
        }
        return { run }
    }

    async function write(item) {
        if (item.skip) return item
        await FSExtra.writeFile(item.output, item.data)
        if (verbose) alert({
            operation: 'combine-pdf-pages',
            input: item.input,
            output: item.output,
            message: 'done'
        })
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const combiners = {
            shell: combinerShell,
            library: combinerLibrary
        }
        const combiner = await combiners[options.method](destination)
        const combine = async item => {
            if (item.skip) return item
            const outputExists = await FSExtra.exists(item.output)
            if (outputExists) {
                if (verbose) alert({
                    operation: 'combine-pdf-pages',
                    input: item.input,
                    output: item.output,
                    message: 'output exists'
                })
                return { ...item, skip: true } // already exists, skip
            }
            if (verbose) alert({
                operation: 'combine-pdf-pages',
                input: item.input,
                output: item.output,
                message: 'combining...'
            })
            try {
                const data = await combiner.run(item)
                return { ...item, data }
            }
            catch (e) {
                alert({
                    operation: 'combine-pdf-pages',
                    input: item.input,
                    output: item.output,
                    message: e.message,
                    isError: true
                })
                return { ...item, skip: true } // failed with error
            }
        }
        const source = () => {
            const listing = FSExtra.opendir(options.originInitial || origin)
            return Scramjet.DataStream.from(listing).map(file => {
                return {
                    name: file.name,
                    input: `${origin}/${file.name}`,
                    output: `${destination}/${file.name}`
                }
            })
        }
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().unorder(listing).unorder(combine).unorder(write)
        return { run, length }
    }

    return setup()

}

export default initialise
