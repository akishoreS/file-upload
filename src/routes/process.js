const express = require('express');
const { findFileRecord, updateFileRecord } = require('../services/fileMetadataService');

function createProcessRouter(jobQueue) {
  if (!jobQueue) {
    throw new Error('Process router requires a job queue');
  }

  const router = express.Router();

  router.post('/process/:fileId', async (req, res, next) => {
    const { fileId } = req.params;
    try {
      const record = await findFileRecord(fileId);
      if (!record) {
        return res.status(404).json({ message: 'Unknown fileId' });
      }

      if (record.status === 'processing') {
        return res.status(202).json({ message: 'File is already being processed', fileId });
      }

      const job = jobQueue.enqueue({ fileId });
      await updateFileRecord(fileId, { status: 'queued', lastJobId: job.id });

      return res.status(202).json({
        message: 'File enqueued for processing',
        fileId,
        jobId: job.id,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/jobs/:jobId', (req, res) => {
    const job = jobQueue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    return res.json(job);
  });

  return router;
}

module.exports = createProcessRouter;


