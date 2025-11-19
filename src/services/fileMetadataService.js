const { getDb } = require('./mongoClient');

const COLLECTION = 'uploads';

async function saveFileRecord(record) {
  const db = getDb();
  await db.collection(COLLECTION).insertOne(record);
  return record;
}

async function updateFileRecord(fileId, changes) {
  const db = getDb();
  const result = await db
    .collection(COLLECTION)
    .findOneAndUpdate(
      { fileId },
      { $set: { ...changes, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
  return result.value;
}

async function findFileRecord(fileId) {
  const db = getDb();
  return db.collection(COLLECTION).findOne({ fileId });
}

module.exports = {
  saveFileRecord,
  updateFileRecord,
  findFileRecord,
};



