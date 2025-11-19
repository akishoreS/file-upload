const { MongoClient } = require('mongodb');
const config = require('../config');
const logger = require('../logger');

let client;
let db;

async function connectMongo() {
  if (db) {
    return db;
  }

  if (!config.mongoUri) {
    throw new Error('Missing MongoDB connection string');
  }

  client = new MongoClient(config.mongoUri, {
    maxPoolSize: 10,
    minPoolSize: 0,
  });

  await client.connect();
  db = client.db(config.mongoDbName);
  logger.info({ db: config.mongoDbName }, 'Connected to MongoDB');
  await ensureIndexes();
  return db;
}

async function ensureIndexes() {
  if (!db) return;
  await db.collection('uploads').createIndex({ fileId: 1 }, { unique: true });
  await db.collection('processed_lines').createIndex({ fileId: 1 });
}

function getDb() {
  if (!db) {
    throw new Error('MongoDB has not been initialized yet');
  }
  return db;
}

async function disconnectMongo() {
  if (client) {
    await client.close();
    client = undefined;
    db = undefined;
  }
}

module.exports = {
  connectMongo,
  getDb,
  disconnectMongo,
};


