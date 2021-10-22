import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import Tempy from 'tempy'
import ChildProcess from 'child_process'

async function initialise(origin, destination, options = { method: 'shell' }, verbose, alert) {

    async function listing(item) {
        if (verbose) alert({
            operation: 'combine-pdf-pages',
            input: item.input,
            output: item.output,
            message: 'combining...'
        })
        const pagesUnsorted = await Globby.globby(item.input)
        if (pagesUnsorted.length === 0) {
            if (verbose) alert({
                operation: 'combine-pdf-pages',
                input: item.input,
                output: item.output,
                message: 'no pages found'
            })
            return { ...item, skip: true } // no pages found to combine, skip
        }
        const pages = pagesUnsorted.sort((a, b) => {
            return Number(a.replace(/[^0-9]/g, '')) - Number(b.replace(/[^0-9]/g, ''))
        })
        return { ...item, pages }
    }

    async function combinerShell() {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            if (item.skip) return item
            const pagesList = item.pages.map(page => `"${page}"`).join(' ')
            const output = Tempy.file()
            const command = `mutool merge -o ${output} ${pagesList}`
            await execute(command)
            const data = await FSExtra.readFile(output)
            await FSExtra.remove(output)
            return data
        }
        return { run }
    }

    async function write(item)  {
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
            shell: combinerShell
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
                return combine(item)
            }
        }
        const sourceGenerator = () => Globby.globbyStream(options.originInitial || origin, {
            objectMode: true,
            onlyFiles: false,
            deep: 1
        })
        const source = () => Scramjet.DataStream.from(sourceGenerator()).map(file => {
            return {
                name: file.name,
                input: `${origin}/${file.name}`,
                output: `${destination}/${file.name}`
            }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().unorder(listing).unorder(combine).unorder(write)
        return { run, length }
    }

    return setup()

}

export default initialise
