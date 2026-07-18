'use strict';

// Seeds Al Qasr Hotel's room layout (58 units). Safe to re-run: existing
// rooms are kept as-is, only missing ones are added.
//
//   Floor 1: rooms 101-112, 114 (113 is skipped) + Royal Room 1   (14)
//   Floor 2: rooms 201-212                                        (12)
//   Floor 3: rooms 301-314                                        (14)
//   Floor 4: suites 401-406                                       (6)
//   Floor 5: rooms 501-512                                        (12)

const store = require('../src/db');

const rooms = [];
for (let n = 101; n <= 112; n++) rooms.push(String(n));
rooms.push('114');
rooms.push('Royal Room 1');
for (let n = 201; n <= 212; n++) rooms.push(String(n));
for (let n = 301; n <= 314; n++) rooms.push(String(n));
for (let n = 401; n <= 406; n++) rooms.push(`جناح ${n}`);
for (let n = 501; n <= 512; n++) rooms.push(String(n));

for (const r of rooms) store.addRoom(r);

const total = store.listRooms().length;
console.log(`Seeded ${rooms.length} units. Rooms now in database: ${total}`);
