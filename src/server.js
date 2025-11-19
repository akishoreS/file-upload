const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const logger = require('./logger');
const { connectMongo } = require('./services/mongoClient');
const uploadRouter = require('./routes/upload');
const createProcessRouter = require('./routes/process');
const healthRouter = require('./routes/health');
const JobQueue = require('./queue/jobQueue');
const createFileProcessor = require('./workers/fileProcessor');

async function bootstrap() {
  await connectMongo();

  const processor = createFileProcessor({ logger });
  const jobQueue = new JobQueue({
    handler: processor,
    concurrency: 2,
    logger,
  });

  jobQueue.on('failed', (job) => logger.error({ job }, 'Job failed'));
  jobQueue.on('succeeded', (job) => logger.info({ jobId: job.id }, 'Job succeeded'));

  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    morgan('combined', {
      stream: {
        write: (message) => logger.info(message.trim()),
      },
    }),
  );

  app.use(uploadRouter);
  app.use(createProcessRouter(jobQueue));
  app.use(healthRouter);

  app.use((err, req, res, next) => {
    logger.error({ err }, 'Unhandled error');
    if (res.headersSent) {
      return next(err);
    }
    return res.status(500).json({ message: 'Internal server error' });
  });

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'Server listening');
  });
}

bootstrap().catch((error) => {
  logger.error({ err: error }, 'Failed to start server');
  process.exitCode = 1;
});


