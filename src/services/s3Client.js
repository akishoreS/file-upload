const { S3Client, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const config = require('../config');

const s3Client = new S3Client({
  region: config.awsRegion,
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

async function uploadToS3({ bucket = config.s3Bucket, key, body, contentType, metadata = {} }) {
  const upload = new Upload({
    client: s3Client,
    leavePartsOnError: false,
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    },
  });

  const result = await upload.done();
  return {
    bucket,
    key,
    etag: result.ETag,
  };
}

async function getObjectStream({ bucket = config.s3Bucket, key }) {
  const { Body } = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  if (!Body) {
    throw new Error('S3 object body missing');
  }

  return Body;
}

async function headObject({ bucket = config.s3Bucket, key }) {
  return s3Client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

module.exports = {
  s3Client,
  uploadToS3,
  getObjectStream,
  headObject,
};


