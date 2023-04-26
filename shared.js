import Path from 'path'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import BetterSqlite3 from 'better-sqlite3'

async function* walk(pathRoot) {
    const filenames = await FSExtra.readdir(pathRoot)
    for (const filename of filenames) {
        const path = Path.resolve(pathRoot, filename)
        if ((await FSExtra.stat(path)).isDirectory()) yield* walk(path)
        else yield path
    }
}

function source(origin) {
    const originResolved = Path.resolve(origin)
    const listing = walk(origin)
    return Scramjet.DataStream.from(listing).map(entry => {
        const name = entry.replace(`${originResolved}/`, '')
        return { name }
    })
}

async function pipeline(origin, destination, stages) {
    const length = await source(origin).reduce(a => a + 1, 0)
    const stream = source(origin)
    const [everything, shutdown] = await stages.reduce(async (previous, stage) => {
        const [last, shutdowns] = await previous
        await last
        const operation = await stage.setup(length)
        return [last.unorder(operation.run), operation.shutdown ? shutdowns.concat(operation.shutdown) : shutdowns]
    }, [stream, []])
    await everything.run()
    await Promise.all(shutdown)
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
    pipeline,
    source,
    caching,
    waypointWith
}
