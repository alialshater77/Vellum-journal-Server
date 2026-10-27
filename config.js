const fs = require('fs');
const path = require('path');

require('dotenv').config();

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function jwtSecret() {
  const secret = clean(process.env.JWT_SECRET);
  if (secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Set JWT_SECRET to a random string of at least 32 characters.');
  }
  return 'somesupersecretsecret';
}

function mongoUri() {
  const user = clean(process.env.MONGO_USER);
  const password = clean(process.env.MONGO_PASSWORD);
  const database = clean(process.env.MONGO_DEFAULT_DATABASE) || 'feed';
  const host = clean(process.env.MONGO_HOST) || 'e-commerce.gyjkjqy.mongodb.net';
  if (!user || !password) {
    throw new Error('Set MONGO_USER and MONGO_PASSWORD.');
  }
  return `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(
    password
  )}@${host}/${database}?retryWrites=true&w=majority`;
}

function frontOrigins() {
  const raw = clean(process.env.FRONT_ORIGIN) || 'http://localhost:3000,http://127.0.0.1:3000';
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function uploadDir() {
  const custom = clean(process.env.UPLOAD_DIR);
  const dir = custom ? path.resolve(custom) : path.join(__dirname, 'images');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function port() {
  const value = Number(process.env.PORT);
  return Number.isInteger(value) && value > 0 ? value : 8080;
}

module.exports = { jwtSecret, mongoUri, frontOrigins, uploadDir, port };
