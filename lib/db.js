/**
 * Tiny JSON-file datastore with atomic writes.
 * Collections live in /data as *.json. Suitable for a small catalogue store;
 * swap for Postgres/MySQL later — the API surface is deliberately minimal.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const cache = new Map();

function fileFor(name) {
  // collection names are internal constants — never user input
  if (!/^[a-z-]+$/.test(name)) throw new Error('Invalid collection name');
  return path.join(DATA_DIR, `${name}.json`);
}

function read(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  const f = fileFor(name);
  let val;
  try {
    val = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    val = fallback !== undefined ? fallback : {};
  }
  cache.set(name, val);
  return val;
}

function write(name, value) {
  const f = fileFor(name);
  const tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, f);
  cache.set(name, value);
  return value;
}

module.exports = { read, write, DATA_DIR };
