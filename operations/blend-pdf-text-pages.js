import Util from 'util'
import FSExtra from 'fs-extra'
import Lookpath from 'lookpath'
import * as Tempy from 'tempy'
import ChildProcess from 'child_process'
import shared from '../shared.js'

async function initialise(origin, originText, destination, parameters, alert) {

    const operation = 'blend-pdf-text-pages'
    const options = {
        useCache: false,
        method: 'qpdf',
        ...parameters
    }
    const cache = await shared.caching(operation)
    const waypoint = shared.waypointWith(alert, cache)

    async function blenderQPDF() {
        const isInstalled = await Lookpath.lookpath('qpdf')
        if (!isInstalled) throw new Error('QPDF not found!')
        const escaped = path => path.replaceAll('"', '\\"')
        const execute = Util.promisify(ChildProcess.exec)
        const run = async item => {
            const output = Tempy.temporaryFile()
            const command = `qpdf "${escaped(item.inputText)}" --overlay "${escaped(item.input)}" -- ${output}`
            try {
                await execute(command)
                await FSExtra.move(output, item.output)
            }
            catch (e) {
                await FSExtra.remove(output)
                const message = e.message.trim()
                    .split('\n')
                    .find(line => line.match('qpdf:'))
                    .replace('qpdf: ', '')
                    .toLowerCase()
                throw new Error(message)
            }
        }
        return run
    }

    async function blender() {
        const methods = {
            qpdf: blenderQPDF
        }
        const method = await methods[options.method]()
        const run = async item => {
            if (item.skip) return item
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'blending...'
            })
            try {
                await method(item)
                waypoint({
                    operation,
                    input: item.input,
                    output: item.output,
                    message: 'done'
                })
                return item
            }
            catch (e) {
                waypoint({
                    operation,
                    input: item.input,
                    output: item.output,
                    message: e.message,
                    importance: 'error'
                })
                return { ...item, skip: true } // execution failed with message
            }
        }
        return run
    }

    async function check(item) {
        if (options.useCache) {
            const cached = cache.existing.get(item.input)
            if (cached) {
                waypoint({
                    operation,
                    input: item.input,
                    output: item.output,
                    cached: true,
                    ...cached
                })
                return { ...item, skip: true }
            }
        }
        const outputExists = await FSExtra.exists(item.output)
        if (outputExists) {
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'output exists'
            })
            return { ...item, skip: true } // we can use cached output
        }
        const buffer = Buffer.alloc(5)
        await FSExtra.read(await FSExtra.open(item.input, 'r'), buffer, 0, 5)
        if (buffer.toString() != '%PDF-') {
            waypoint({
                operation,
                input: item.input,
                output: item.output,
                message: 'not a valid PDF file',
                importance: 'error'
            })
            return { ...item, skip: true } // not a valid PDF file
        }
        return item
    }

    async function setup() {
        await FSExtra.ensureDir(destination)
        const blend = await blender()
        const source = () => shared.source(origin, destination).unorder(entry => {
            return {
                ...entry,
                inputText: `${originText}/${entry.name}`,
            }
        })
        const length = () => source().reduce(a => a + 1, 0)
        const run = source().unorder(check).unorder(blend)
        return { run, length }
    }

    return setup()

}

export default initialise
