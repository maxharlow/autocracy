import Path from 'path'
import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'

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

export default { source }
