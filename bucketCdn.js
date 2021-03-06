const AWS = require('aws-sdk')
const readdirp = require('readdirp')
const path = require('path')
const s3Sync = require('./s3SyncAws')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = async function bucketCdn (
  actionParams,
  app,
  stackforge,
  tfOutputs
) {
  const sourceDir = path.join(process.cwd(), actionParams.websiteFilesDir);
  const bucket = tfOutputs[`${app}.bucket_name`]
  const distributionId = tfOutputs[`${app}.cloudfront_distribution_id`]

  return new Promise((resolve, reject) => {
    const files = readdirp(sourceDir)
    const uploader = s3Sync({
      bucket: bucket,
      concurrency: 16,
      force: true
    })
      .on('end', resolve)
      .on('error', reject)
    files.pipe(uploader)
  }).then(async () => {
    const cf = new AWS.CloudFront({
      region: stackforge.service.region
    })
    const { Invalidation } = await cf
      .createInvalidation({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: `${Math.round(Date.now() / 1000)}`,
          Paths: {
            Quantity: 1,
            Items: ['/*']
          }
        }
      })
      .promise()

    let invalidationComplete = false
    do {
      await sleep(5000)
      const { Invalidation: { Status }} = await cf.getInvalidation({
        DistributionId: distributionId,
        Id: Invalidation.Id
      }).promise()
      invalidationComplete = Status === 'Completed'
    } while (!invalidationComplete)
  })
}
