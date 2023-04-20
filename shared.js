import Path from 'path'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import BetterSqlite3 from 'better-sqlite3'

function runProcess(segments, progress) {
    const longest = Math.max(...segments.map(segment => segment.name.length))
    return segments.reduce(async (previous, segment) => {
        await previous
        const operation = await segment.setup()
        const total = await operation.length()
        await operation.run.each(progress(`${segment.name}...`.padEnd(longest + 3, ' '), total)).whenEnd()
        if (operation.shutdown) await operation.shutdown()
    }, Promise.resolve())
}

async function runOperation(operation, progress) {
    const total = await operation.length()
    await operation.run.each(progress('Working...', total)).whenEnd()
    if (operation.shutdown) await operation.shutdown()
}

async function* walk(pathRoot) {
    const filenames = await FSExtra.readdir(pathRoot)
    for (const filename of filenames) {
        const path = Path.resolve(pathRoot, filename)
        if ((await FSExtra.stat(path)).isDirectory()) yield* walk(path)
        else yield path
    }
}

function source(origin, destination, { paged, originInput } = {}) {
    const originResolved = Path.resolve(origin)
    const listing = walk(origin)
    return Scramjet.DataStream.from(listing).map(entry => {
        const name = entry.replace(`${originResolved}/`, '')
        return {
            name: paged ? Path.dirname(entry).replace(`${originResolved}/`, '') : name, // if origin is page-files, 'name' should refer to the original document name
            input: `${originInput || origin}/${name}`, // originInput used when the origin we are listing is not the actual location of the files we want to use
            output: `${destination}/${name}`
        }
    })
}

async function caching(operation) {
    await FSExtra.ensureDir('.autocracy-cache')
    const database = new BetterSqlite3('.autocracy-cache/register.db')
    const operationName = operation.replaceAll('-', '_')
    database.prepare(`create table if not exists ${operationName} (input primary key, message, importance)`).run()
    database.prepare(`create index if not exists ${operationName}_input on ${operationName} (input)`).run()
    return {
        existing: database.prepare(`select message, importance from ${operationName} where input = ?`),
        add: database.prepare(`insert or replace into ${operationName} (input, message, importance) values (@input, @message, @importance)`)
    }
}

function waypointWith(alert, cache) {
    return details => {
        alert(details)
        cache.add.run({
            input: details.input,
            message: details.message,
            importance: details.importance
        })
    }
}

export default {
    runProcess,
    runOperation,
    source,
    caching,
    waypointWith
}
