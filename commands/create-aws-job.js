import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import AWS from 'aws-sdk'
import BetterSQLite3 from 'better-sqlite3'

async function setup(origin, jobfile, verbose, alert) {
    const originPoint = origin.indexOf('/')
    const originBucket = originPoint ? origin.slice(0, originPoint) : origin
    const originPath = originPoint ? origin.slice(originPoint + 1) : null
    const s3 = new AWS.S3()
    const region = await s3.getBucketLocation({ Bucket: originBucket }).promise()
    const textract = new AWS.Textract({ region: region.LocationConstraint })
    const jobfileExists = await FSExtra.pathExists(jobfile)
    const jobs = new BetterSQLite3(jobfile)
    if (jobfileExists) alert('Existing jobfile data found!')
    else {
        jobs.prepare('create table jobs (bucket, prefix, key, job)').run()
        jobs.prepare('create unique index jobs_key on jobs (key)')
        jobs.prepare('create table meta (key, value)').run()
        jobs.prepare(`insert into meta (key, value) values ("region", ${region.LocationConstraint})`).run()
    }
    const getJob = jobs.prepare('select job from jobs where key = ?')
    const addJob = jobs.prepare('insert into jobs (bucket, prefix, key, job) values (@bucket, @prefix, @key, @job)')
    async function* list(marker) {
        const params = {
            Bucket: originBucket,
            ...(originPath ? { Prefix: originPath } : {}),
            ...(marker ? { StartAfter: marker } : {})
        }
        const response = await s3.listObjectsV2(params).promise()
        yield* response.Contents.map(item => item.Key)
        if (response.IsTruncated) yield* list(response.Contents.pop().Key)
    }
    const delay = seconds => {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000))
    }
    const setup = async path => {
        const key = path.split('/').pop()
        const exists = getJob.get(key)
        if (exists) {
            if (verbose) alert(`Already started: ${key}`)
            return key
        }
        const params = {
            DocumentLocation: {
                S3Object: {
                    Bucket: originBucket,
                    Name: path
                }
            }
        }
        try {
            const process = await textract.startDocumentTextDetection(params).promise()
            addJob.run({
                bucket: originBucket,
                prefix: originPath,
                key,
                job: process.JobId
            })
            if (verbose) alert(`Starting: ${key}`)
            await delay(1) // todo -- call aws quota api for this number
            return key
        }
        catch (e) {
            if (e.message.includes('jobs exceed maximum concurrent job limit')) {
                alert('Error: Maximum concurrent job limit exceeded (retrying after a short delay...)')
                await delay(10)
            }
            if (e.message.includes('rate exceeded')) {
                alert('Error: Rate limit exceeded (retrying after a short delay...)')
                await delay(5)
            }
            alert(`Error: ${e.message} (retrying...)`)
            return setup(path)
        }
    }
    const source = () => Scramjet.DataStream.from(list())
    const length = () => source().reduce(a => a + 1, 0)
    const run = () => source().setOptions({ maxParallel: 1 }).map(setup)
    return { run, length }
}

export default setup
