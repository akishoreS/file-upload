# Complete Testing Guide

This guide walks you through testing the entire file upload and processing system.

## Prerequisites

- Server running on `http://localhost:8080`
- MongoDB running and accessible
- AWS S3 credentials configured in `.env`
- A test JSON/JSONL file ready

## Step-by-Step Testing

### Step 1: Upload a File

Upload your test JSON file to the server:

```bash
curl -F "file=@your-test-file.json" http://localhost:8080/upload
```

**Expected Response:**
```json
{
  "fileId": "abc123-def456-...",
  "bucket": "coocicoach-s3",
  "s3Key": "uploads/abc123-...-your-test-file.json",
  "etag": "\"some-etag-value\""
}
```

**Save the `fileId` from the response!** You'll need it for the next steps.

---

### Step 2: Verify File Metadata in MongoDB

You can check that the file metadata was saved (optional, but good to verify):

```bash
# If you have mongosh installed:
mongosh mongodb://127.0.0.1/file_upload_service
# Then run:
db.files.findOne({ fileId: "YOUR_FILE_ID_HERE" })
```

You should see a document with:
- `fileId`
- `bucket`
- `s3Key`
- `status: "uploaded"`
- `size`, `originalName`, etc.

---

### Step 3: Queue the File for Processing

Use the `fileId` from Step 1 to enqueue a processing job:

```bash
curl -X POST http://localhost:8080/process/YOUR_FILE_ID_HERE
```

**Example:**
```bash
curl -X POST http://localhost:8080/process/e58d8682-0954-4276-943a-56ff9b6b7b3c
```

**Expected Response (202 Accepted):**
```json
{
  "message": "File enqueued for processing",
  "fileId": "e58d8682-0954-4276-943a-56ff9b6b7b3c",
  "jobId": "another-uuid-here"
}
```

**Save the `jobId`!** You'll use it to check job status.

---

### Step 4: Check Job Status

Query the job status using the `jobId` from Step 3:

```bash
curl http://localhost:8080/jobs/YOUR_JOB_ID_HERE
```

**Possible States:**
- `"queued"` - Job is waiting in the queue
- `"active"` - Job is currently being processed
- `"succeeded"` - Job completed successfully
- `"failed"` - Job failed (check `error` field)

**Example Response (while processing):**
```json
{
  "id": "job-uuid",
  "payload": { "fileId": "file-uuid" },
  "state": "active",
  "enqueuedAt": "2025-01-18T...",
  "startedAt": "2025-01-18T...",
  "attempts": 1
}
```

**Example Response (completed):**
```json
{
  "id": "job-uuid",
  "payload": { "fileId": "file-uuid" },
  "state": "succeeded",
  "enqueuedAt": "2025-01-18T...",
  "startedAt": "2025-01-18T...",
  "finishedAt": "2025-01-18T...",
  "attempts": 1
}
```

---

### Step 5: Verify Processed Data in MongoDB

After the job completes, check that the file contents were processed and stored:

```bash
mongosh mongodb://127.0.0.1/file_upload_service
```

**Check processed lines:**
```javascript
db.processed_lines.find({ fileId: "YOUR_FILE_ID_HERE" }).pretty()
```

You should see documents like:
```json
{
  "fileId": "e58d8682-0954-4276-943a-56ff9b6b7b3c",
  "lineNumber": 1,
  "state": "parsed",
  "payload": { /* parsed JSON object */ },
  "rawText": "{\"key\":\"value\"}",
  "createdAt": ISODate("2025-01-18T...")
}
```

For lines that failed to parse:
```json
{
  "fileId": "e58d8682-0954-4276-943a-56ff9b6b7b3c",
  "lineNumber": 3,
  "state": "errored",
  "rawText": "invalid json line",
  "error": "Unexpected token i in JSON at position 0",
  "createdAt": ISODate("2025-01-18T...")
}
```

**Check updated file metadata:**
```javascript
db.files.findOne({ fileId: "YOUR_FILE_ID_HERE" })
```

The status should now be `"completed"` with:
- `status: "completed"`
- `processedLines: <number>`
- `processingStartedAt: <timestamp>`
- `processingFinishedAt: <timestamp>`

---

### Step 6: Test Health Endpoint

Verify the server is healthy:

```bash
curl http://localhost:8080/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-18T..."
}
```

---

## Complete Test Script (PowerShell)

Here's a complete PowerShell script to automate the testing:

```powershell
# Step 1: Upload file
Write-Host "Step 1: Uploading file..." -ForegroundColor Green
$uploadResponse = curl -F "file=@test.jsonl" http://localhost:8080/upload | ConvertFrom-Json
$fileId = $uploadResponse.fileId
Write-Host "Uploaded! FileId: $fileId" -ForegroundColor Green

# Step 2: Process file
Write-Host "`nStep 2: Queuing file for processing..." -ForegroundColor Green
$processResponse = curl -X POST "http://localhost:8080/process/$fileId" | ConvertFrom-Json
$jobId = $processResponse.jobId
Write-Host "Queued! JobId: $jobId" -ForegroundColor Green

# Step 3: Poll job status
Write-Host "`nStep 3: Checking job status..." -ForegroundColor Green
do {
    Start-Sleep -Seconds 2
    $jobStatus = curl "http://localhost:8080/jobs/$jobId" | ConvertFrom-Json
    Write-Host "Job state: $($jobStatus.state)" -ForegroundColor Yellow
} while ($jobStatus.state -eq "queued" -or $jobStatus.state -eq "active")

if ($jobStatus.state -eq "succeeded") {
    Write-Host "`n✅ Processing completed successfully!" -ForegroundColor Green
} else {
    Write-Host "`n❌ Processing failed: $($jobStatus.error)" -ForegroundColor Red
}
```

---

## Troubleshooting

### Upload fails
- Check AWS credentials in `.env`
- Verify S3 bucket exists and is accessible
- Check file size (limit is 200MB)

### Processing fails
- Check MongoDB connection
- Verify file exists in S3
- Check server logs for detailed errors
- Ensure file is text-based (not binary like PDF)

### Job stays in "queued" state
- Check server logs for errors
- Verify MongoDB connection
- Check if previous job is still running (concurrency limit is 2)

---

## Expected Behavior Summary

1. ✅ **Upload**: File streams to S3, metadata saved to MongoDB
2. ✅ **Process**: Job queued, worker streams file from S3 line-by-line
3. ✅ **Parse**: Each line attempted as JSON, failures captured gracefully
4. ✅ **Store**: Processed lines batched (100 at a time) into MongoDB
5. ✅ **Status**: File metadata updated to "completed" with line count


