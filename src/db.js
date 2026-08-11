'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Node 22.5+ ships SQLite built in; older Nodes (e.g. 20.x) fall back to
// better-sqlite3. Both expose the same prepare/get/all/run/exec API surface.
const DB_FILE = path.join(DATA_DIR, 'survey.db');
let db;
try {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(DB_FILE);
} catch {
  const Database = require('better-sqlite3');
  db = new Database(DB_FILE);
}
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const RATING_KEYS = [
  'room_clean', 'room_bed', 'room_bath', 'room_ac', 'room_quiet',
  'hotel_checkin', 'hotel_reception', 'hotel_facilities', 'hotel_speed',
  'rest_food', 'rest_breakfast', 'rest_clean', 'rest_staff', 'rest_speed',
  'overall',
];

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_number TEXT NOT NULL UNIQUE,
    token TEXT NOT NULL UNIQUE,
    locked_until TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    language TEXT NOT NULL DEFAULT 'ar',
    ${RATING_KEYS.map((k) => `${k} INTEGER NOT NULL CHECK (${k} BETWEEN 1 AND 5)`).join(',\n    ')},
    recommend TEXT NOT NULL CHECK (recommend IN ('yes', 'maybe', 'no')),
    comments TEXT,
    contact TEXT,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Lightweight migrations for databases created by older versions.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('rooms', 'guest_name', 'guest_name TEXT');
ensureColumn('responses', 'guest_name', 'guest_name TEXT');

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

// One-time defaults
if (!getSetting('admin_password_hash')) {
  setSetting('admin_password_hash', bcrypt.hashSync('admin123', 10));
}
if (!getSetting('session_secret')) {
  setSetting('session_secret', crypto.randomBytes(32).toString('hex'));
}
if (!getSetting('hotel_name_ar')) setSetting('hotel_name_ar', 'فندق القصر');
if (!getSetting('hotel_name_en')) setSetting('hotel_name_en', 'Al Qasr Hotel');
if (!getSetting('lock_hours')) setSetting('lock_hours', '24');
if (!getSetting('base_url')) setSetting('base_url', 'http://192.168.1.14:8090');

function newToken() {
  return crypto.randomBytes(10).toString('hex');
}

function getRoomByToken(token) {
  return db.prepare('SELECT * FROM rooms WHERE token = ?').get(token);
}

function isRoomLocked(room) {
  if (!room.locked_until) return false;
  const row = db
    .prepare("SELECT CASE WHEN ? > datetime('now') THEN 1 ELSE 0 END AS locked")
    .get(room.locked_until);
  return row.locked === 1;
}

function lockRoom(roomId, hours) {
  db.prepare(
    "UPDATE rooms SET locked_until = datetime('now', '+' || ? || ' hours') WHERE id = ?"
  ).run(String(hours), roomId);
}

function reopenRoom(roomId) {
  db.prepare('UPDATE rooms SET locked_until = NULL WHERE id = ?').run(roomId);
}

function deleteRoom(roomId) {
  db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
}

function addRoom(roomNumber) {
  db.prepare('INSERT OR IGNORE INTO rooms (room_number, token) VALUES (?, ?)').run(
    String(roomNumber),
    newToken()
  );
}

function listRooms() {
  return db
    .prepare(
      `SELECT r.*,
              CASE WHEN r.locked_until IS NOT NULL AND r.locked_until > datetime('now') THEN 1 ELSE 0 END AS locked,
              (SELECT COUNT(*) FROM responses WHERE room_id = r.id) AS response_count
         FROM rooms r
        ORDER BY CAST(r.room_number AS INTEGER), r.room_number`
    )
    .all();
}

function insertResponse(roomId, language, ratings, recommend, comments, contact, guestName) {
  const cols = ['room_id', 'language', ...RATING_KEYS, 'recommend', 'comments', 'contact', 'guest_name'];
  const placeholders = cols.map(() => '?').join(', ');
  db.prepare(`INSERT INTO responses (${cols.join(', ')}) VALUES (${placeholders})`).run(
    roomId,
    language,
    ...RATING_KEYS.map((k) => ratings[k]),
    recommend,
    comments || null,
    contact || null,
    guestName || null
  );
}

function setRoomGuest(roomId, guestName) {
  db.prepare('UPDATE rooms SET guest_name = ? WHERE id = ?').run(guestName || null, roomId);
}

const RESPONSE_SORTS = {
  newest: 'resp.submitted_at DESC',
  oldest: 'resp.submitted_at ASC',
  room: 'CAST(r.room_number AS INTEGER), r.room_number, resp.submitted_at DESC',
  overall_desc: 'resp.overall DESC, resp.submitted_at DESC',
  overall_asc: 'resp.overall ASC, resp.submitted_at DESC',
};

function listResponses(filters = {}, limit = 500) {
  const where = [];
  const params = [];
  if (filters.roomId) {
    where.push('resp.room_id = ?');
    params.push(filters.roomId);
  }
  if (filters.from) {
    where.push('date(resp.submitted_at) >= date(?)');
    params.push(filters.from);
  }
  if (filters.to) {
    where.push('date(resp.submitted_at) <= date(?)');
    params.push(filters.to);
  }
  if (filters.q) {
    where.push('(resp.comments LIKE ? OR resp.contact LIKE ? OR resp.guest_name LIKE ?)');
    const like = `%${filters.q}%`;
    params.push(like, like, like);
  }
  const orderBy = RESPONSE_SORTS[filters.sort] || RESPONSE_SORTS.newest;
  return db
    .prepare(
      `SELECT resp.*, r.room_number
         FROM responses resp
         JOIN rooms r ON r.id = resp.room_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY ${orderBy}
        LIMIT ?`
    )
    .all(...params, limit);
}

function stats() {
  const totals = db.prepare('SELECT COUNT(*) AS n FROM responses').get();
  const avgSelect = RATING_KEYS.map((k) => `ROUND(AVG(${k}), 2) AS ${k}`).join(', ');
  const averages = db.prepare(`SELECT ${avgSelect} FROM responses`).get();
  const recommend = db
    .prepare('SELECT recommend, COUNT(*) AS n FROM responses GROUP BY recommend')
    .all();
  const byDay = db
    .prepare(
      `SELECT date(submitted_at) AS day, COUNT(*) AS n, ROUND(AVG(overall), 2) AS avg_overall
         FROM responses GROUP BY day ORDER BY day DESC LIMIT 14`
    )
    .all();
  return { total: totals.n, averages, recommend, byDay };
}

module.exports = {
  db,
  DATA_DIR,
  RATING_KEYS,
  getSetting,
  setSetting,
  getRoomByToken,
  isRoomLocked,
  lockRoom,
  reopenRoom,
  deleteRoom,
  addRoom,
  setRoomGuest,
  listRooms,
  insertResponse,
  listResponses,
  stats,
};
