# File Upload + Processing Service

An Express.js backend that streams uploaded text files to S3, tracks file
metadata in MongoDB, and offers an optional background job queue that ingests
the file contents into MongoDB without blocking the main server.

## Architecture Overview

- **Express API (EC2, Node 20)** – Handles HTTP traffic, file uploads, and job
  orchestration.
- **S3** – Durable blob storage for the raw text files. Uploads are streamed
  (no buffering in memory).
- **MongoDB** – Persists upload metadata plus the interpreted output of each
  line. Designed to work with Atlas or a self-managed cluster.
- **In-memory job queue** – FIFO queue with retry logic and bounded concurrency
  so expensive work happens off the request path.

```
Client --> POST /upload  --> Express --> S3
                 |                         \
                 |                          --> Mongo (file metadata)
Client --> POST /process/:fileId --> enqueue job --> worker --> S3 stream --> Mongo
```

### Key Design Choices

- **Streaming everywhere** – Multer writes to a temp file, which is immediately
  streamed to S3. Processing uses `readline` over the S3 stream, so files never
  have to fit into RAM.
- **Resilient parsing** – Every line is attempted as JSON. Failures are captured
  with an `errored` state so a single bad line never crashes the job.
- **Batch writes** – Mongo inserts happen in batches of 100 to avoid hammering
  the database (`MongoDB is not fond of being interrupted thousands of times`).
- **Fair queue** – Jobs are serviced FIFO with a configurable concurrency (set
  to 2). Each job has a status you can query.
- **Stateless server** – The queue is in-memory for simplicity, but file
  metadata lives in MongoDB so the /process API can recover even if the server
  restarts. The README explains how to swap the queue state into Mongo if
  durability across restarts is required.

## Getting Started Locally

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment**
   ```bash
   cp env.example .env
   # Fill in AWS + Mongo credentials
   ```
3. **Run the server**
   ```bash
   npm run dev
   ```
4. **Exercise the APIs**
   ```bash
   curl -F "file=@/path/to/data.txt" http://localhost:8080/upload
   curl -X POST http://localhost:8080/process/<fileId>
   curl http://localhost:8080/jobs/<jobId>
   ```

## API Reference

| Endpoint | Description |
| --- | --- |
| `POST /upload` | Accepts a text file (`multipart/form-data`, field name `file`). Streams it to S3 and stores metadata in MongoDB. Response includes `fileId`, `s3Key`, and `bucket`. |
| `POST /process/:fileId` | Queues a job that streams the file back from S3, interprets each line, and stores the results in MongoDB. Returns `202 Accepted` with a `jobId`. |
| `GET /jobs/:jobId` | Returns `{ state, attempts, queuedAt, startedAt, finishedAt }` for the in-memory queue. |
| `GET /health` | Liveness probe used by AWS ALB or Kubernetes. |

### Processing semantics

- Each non-empty line is attempted as JSON.
- Success is stored as `{ state: 'parsed', payload: <object> }`.
- Failures are stored as `{ state: 'errored', rawText, error }`.
- Batched inserts keep MongoDB happy and make the job idempotent. If the same
  file is reprocessed, clean up (e.g., delete existing `processed_lines` docs)
  before queuing or write idempotency logic (see “Further Improvements”).

## Deployment Guide (EC2 + S3 + MongoDB Atlas)

1. **Provision AWS resources**
   - Create an S3 bucket (enable server-side encryption).
   - Create an IAM user or role with `s3:PutObject`, `s3:GetObject`, and
     `s3:HeadObject` scoped to that bucket.
   - Launch an EC2 instance (Amazon Linux 2023 or Ubuntu 22.04) with Node.js 20
     installed (`nvm install 20`).
2. **Allow network traffic**
   - Open inbound TCP 80 (or 8080) for HTTP.
   - Ensure outbound 443 is allowed so the server can reach S3 and MongoDB Atlas.
3. **Install application**
   ```bash
   sudo yum update -y
   curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo -E bash -
   sudo yum install -y nodejs git
   git clone https://github.com/<you>/file-upload.git
   cd file-upload
   npm install
   cp env.example .env   # then edit with real secrets
   ```
4. **Run as a service**
   - The simplest approach is `npm run start` in a `tmux` or `screen` session.
   - For production, install PM2 or write a systemd unit:
     ```bash
     sudo npm install -g pm2
     pm2 start src/server.js --name file-upload
     pm2 save
     pm2 startup systemd
     ```
5. **Wire up the URLs**
   - Point your domain (or directly expose the EC2 public IP) to the instance.
   - Verify `POST http://<EC2-host>/upload` works.

## Job Queue Internals

- FIFO array with a configurable concurrency (default 2).
- Each job keeps timestamps, attempt count, and the last error.
- Automatic retries with exponential back-off (max 3 tries).
- Because the queue lives in memory, a restart clears active jobs. To persist
  them, write the job state to MongoDB and rehydrate the queue on boot. The
  class is intentionally small so you can swap the storage layer in a follow-up.

## Handling Large Files & Faulty Lines

- Upload path never buffers the entire file – multer writes straight to disk and
  `@aws-sdk/lib-storage` streams that file to S3 in chunks.
- Processing uses the `readline` iterator over the S3 stream, so memory usage is
  `O(batch size)` (100 documents by default) rather than `O(file size)`.
- Bad lines are isolated. They are recorded with `state: 'errored'` so you can
  inspect them later without reprocessing the entire file.

