const readline = require('node:readline');
const { getObjectStream } = require('../services/s3Client');
const { getDb } = require('../services/mongoClient');
const { findFileRecord, updateFileRecord } = require('../services/fileMetadataService');

const BATCH_SIZE = 100;

function interpretLine(line, lineNumber, fileId) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return {
      fileId,
      lineNumber,
      state: 'parsed',
      payload: parsed,
      rawText: trimmed,
      createdAt: new Date(),
    };
  } catch (error) {
    return {
      fileId,
      lineNumber,
      state: 'errored',
      rawText: trimmed,
      error: error.message,
      createdAt: new Date(),
    };
  }
}

function createFileProcessor({ logger }) {
  return async function processJob(job) {
    const { fileId } = job.payload;
    const record = await findFileRecord(fileId);
    if (!record) {
      throw new Error(`File metadata not found for fileId ${fileId}`);
    }

    await updateFileRecord(fileId, {
      status: 'processing',
      lastJobId: job.id,
      processingStartedAt: new Date(),
    });

    const stream = await getObjectStream({ bucket: record.bucket, key: record.s3Key });
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    const db = getDb();
    const collection = db.collection('processed_lines');
    const batch = [];
    let processed = 0;

    try {
      for await (const line of rl) {
        const doc = interpretLine(line, processed + 1, fileId);
        if (doc) {
          batch.push(doc);
          processed += 1;
        }

        if (batch.length >= BATCH_SIZE) {
          await collection.insertMany(batch, { ordered: false });
          batch.length = 0;
        }
      }

      if (batch.length) {
        await collection.insertMany(batch, { ordered: false });
      }

      await updateFileRecord(fileId, {
        status: 'completed',
        processedLines: processed,
        processingFinishedAt: new Date(),
      });
      logger.info({ fileId, processed }, 'Finished processing file');
    } catch (error) {
      await updateFileRecord(fileId, {
        status: 'failed',
        processingError: error.message,
      });
      logger.error({ fileId, err: error }, 'Processing failed');
      throw error;
    }
  };
}

module.exports = createFileProcessor;


