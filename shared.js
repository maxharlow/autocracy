import Path from 'path'
import Scramjet from 'scramjet'
import Klaw from 'klaw'

function source(origin, destination, { paged, originInput } = {}) {
    const originResolved = Path.resolve(origin)
    const listing = Klaw(origin)
    return Scramjet.DataStream.from(listing).map(entry => {
        if (!entry.stats.isFile()) return
        const name = entry.path.replace(`${originResolved}/`, '')
        return {
            name: paged ? Path.dirname(entry.path).replace(`${originResolved}/`, '') : name, // if origin is page-files, 'name' should refer to the original document name
            input: `${originInput || origin}/${name}`, // originInput used when the origin we are listing is not the actual location of the files we want to use
            output: `${destination}/${name}`
        }
    })
}

export default { source }
