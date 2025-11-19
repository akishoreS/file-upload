const path = require('path');
const dotenv = require('dotenv');
const logger = require('./logger');

dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
});

const config = {
  port: Number(process.env.PORT || 8080),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  awsRegion: process.env.AWS_REGION,
  s3Bucket: process.env.S3_BUCKET,
  mongoUri: process.env.MONGODB_URI,
  mongoDbName: process.env.MONGODB_DB_NAME,
};

const requiredKeys = ['awsRegion', 's3Bucket', 'mongoUri', 'mongoDbName'];

function validateConfig() {
  const missing = requiredKeys.filter((key) => !config[key]);
  if (missing.length) {
    logger.warn(
      { missing },
      'Some required configuration values are missing. Make sure your environment variables are set before deploying.',
    );
  }
}

validateConfig();

module.exports = config;



