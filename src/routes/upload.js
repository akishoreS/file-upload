const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { uploadToS3 } = require('../services/s3Client');
const { saveFileRecord } = require('../services/fileMetadataService');

const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 200, // 200MB per file; adjust per EC2 size
  },
});

const router = express.Router();

router.post('/upload', upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: 'file field is required' });
  }

  const fileId = randomUUID();
  const s3Key = `uploads/${fileId}-${req.file.originalname}`;
  const filePath = req.file.path;

  try {
    const s3Result = await uploadToS3({
      key: s3Key,
      body: fs.createReadStream(filePath),
      contentType: req.file.mimetype || 'text/plain',
      metadata: {
        originalname: req.file.originalname,
      },
    });

    await saveFileRecord({
      fileId,
      bucket: s3Result.bucket,
      s3Key: s3Result.key,
      etag: s3Result.etag,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      status: 'uploaded',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return res.status(201).json({
      fileId,
      bucket: s3Result.bucket,
      s3Key: s3Result.key,
      etag: s3Result.etag,
    });
  } catch (error) {
    return next(error);
  } finally {
    fs.promises.unlink(filePath).catch(() => {});
  }
});

module.exports = router;

