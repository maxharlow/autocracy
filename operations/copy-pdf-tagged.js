import Util from 'util'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import * as Globby from 'globby'
import Lookpath from 'lookpath'
import ChildProcess from 'child_process'

async function initialise(origin, destination, options = { method: 'shell' }, verbose, alert) {

    async function detectorShell() {
        const isInstalled = await Lookpath.lookpath('mutool')
        if (!isInstalled) throw new Error('MuPDF not found!')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const command = `mutool draw -F txt "${origin}/${item.name}"`
            if (verbose) alert(command)
            const result = await execute(command)
            return result.stdout.trim() !== ''
        }
        return { run }
    }

    async function copyMaybe(item) {
        const detectors = {
            shell: detectorShell
        }
        const detector = await detectors[options.method]()
        const isTagged = await detector.run(item)
        if (isTagged) {
            const copyFrom = `${origin}/${item.name}`
            const copyTo = `${destination}/${item.name}`
            if (verbose) alert(`Copying ${copyFrom} to ${copyTo}...`)
            await FSExtra.copy(copyFrom, copyTo)
        }
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const sourceGenerator = () => Globby.globbyStream(origin, {
            objectMode: true,
            deep: 1
        })
        const source = () => Scramjet.DataStream.from(sourceGenerator()).map(file => {
            return {
                name: file.name
            }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = () => source().map(copyMaybe)
        return { run, length }
    }

    return setup()

}

export default initialise
