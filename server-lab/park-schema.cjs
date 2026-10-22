'use strict';
// NBA 2K22 (SHA-256 1727ad72...bbf5) object schemas recovered statically.
//   GAMEOBJECT base dirty printer 1416B8210, value reader 14164AD50.
//   COURT dirty printer 1416B4EC0, flag reader 141650420, value reader 141648030.
// Each entry: [name, byteSize, count]. Bits are assigned in order; arrays take
// one bit per element. All values are copied raw into native structs, so
// multi-byte integers and floats are little-endian. Strings/blobs are
// length-prefixed (u32 LE) and marked with size 'var'.

const BASE = [
  ['Name', 4, 1], ['IsActiveFlag', 1, 1], ['IsDestroyFlag', 1, 1], ['IsDummyObject', 1, 1],
  ['Transform', 64, 1], ['Interaction', 20, 3], ['ArtBinding', 4, 1], ['ObjectState', 4, 1],
  ['PacketId', 1, 1], ['IsLockstep', 1, 1], ['Uuid', 16, 1], ['Address', 4, 1], ['Port', 2, 1],
  ['VPort', 2, 1], ['RandomSeed', 8, 1], ['MatchId', 8, 1], ['LastError', 4, 1], ['ByteMatchCode', 4, 1],
];

const COURT = [
  ['CourtType', 4, 1], ['FlipDirectionOfPlay', 1, 1], ['IsHalfCourt', 1, 1], ['CurrentStreak', 2, 1],
  ['HasWaitingArea', 1, 1], ['Lastscore', 2, 1], ['Highscore', 2, 1], ['HighscorePuid', 8, 1],
  ['NumberOfAwayTeam', 1, 1], ['StartType', 4, 1], ['AwayTeam', 8, 5], ['AwayTeamConfirmed', 1, 5],
  ['AwayTeamPrepared', 1, 5], ['AwayTeamResult', 4, 5], ['AwayUserData', 'var', 5],
  ['NumberOfHomeTeam', 1, 1], ['HomeTeam', 8, 5], ['HomeTeamPrepared', 1, 5], ['HomeTeamConfirmed', 1, 5],
  ['HomeTeamResult', 4, 5], ['HomeUserData', 'var', 5], ['GamePreparedValid', 1, 1],
  ['NumberOfGotNextSpots', 1, 1], ['GotNextSpots', 0x48, 3], ['GotNextSpotsSetup', 0x90, 3],
  ['WinnerStartLocation', 16, 1], ['WinnerOffset', 16, 1], ['WinnerFacing', 4, 1],
  ['LoserStartLocation', 16, 1], ['LoserOffset', 16, 1], ['LoserFacing', 4, 1],
  ['UtilityStartLocation', 16, 1], ['UtilityOffset', 16, 1], ['UtilityFacing', 4, 1],
  ['HomeSpotCount', 1, 1], ['AwaySpotCount', 1, 1], ['UtilityPlayerCount', 1, 1],
  ['UtilityPlayerList', 1, 8], ['UtilityPuidList', 8, 8], ['UtilityMachineIdList', 8, 8],
  ['EventPresentation', 1, 1], ['GamblingIndex', 1, 1], ['FakeGamePlayback', 1, 1], ['WinnerWaitPositions', 1, 1],
  ['BallType', 4, 1], ['OverrideBallType', 4, 1], ['GameStartTime', 8, 1], ['BasketType', 4, 1],
  ['NetType', 4, 1], ['CourtColor', 4, 1], ['LogoFilename', 'var', 1], ['PresentationJson', 'var', 1],
  ['GameProgressValid', 1, 1], ['GameProgressHome', 4, 5], ['GameProgressAway', 4, 5],
];

function layout(entries, first = 0) {
  const byName = {}; let bit = first;
  for (const [name, size, count] of entries) { byName[name] = { bit, size, count }; bit += count; }
  return { byName, bits: bit };
}

const Base = layout(BASE);
const Court = layout(COURT, Base.bits);
if (Base.bits !== 20 || Court.bits !== 148) throw new Error('Recovered schema size changed');

const CLASS = {
  Court: 0x2c4d49e3, // TKWORLD_SERVEROBJECT_COURT
  Player: 0x2c5d2702, // TKWORLD_SERVEROBJECT_PLAYER
  Slot: 0x90acaee4, // TKWORLD_SERVEROBJECT_SLOT
  MyCourt: 0x16a0d01e, // TKWORLD_SERVEROBJECT_MYCOURT
  Position: 0x36bf2a26,
};

const PACKET = {
  ObjectData: 0x9c72247c, ObjectUpdateList: 0x618ec78c, RequestAck: 0x2b84ffc2,
  Request: 0xce148fb1, PlayerHandshake: 0x366444c1, ClientUpdate: 0xfef2dd68,
  CompressedCommand: 0x9e3471ed, Movement: 0xce1c9e8c, Connect: 0x9d32c5b4,
};

// CRC32 of the upper-case names (dictionary built from the executable strings).
const CRC = {
  COMMAND: 0xb18f14ce, AREA: 0xe101d0dc, JOIN: 0x1ef43563, LEAVE: 0x6ce44260, READY: 0xdfc1471f,
  GAME_END: 0xdaeafe9e, RESULT: 0xe3920695, WON: 0x7037de7a, NO_WINNERS: 0x466750bb, LOST: 0x76d0691e,
  USERDATA: 0xcdbd175e, COMPRESSED_DATA: 0x970e50df, DATA: 0x9b661ed7, NAME: 0x68b693b2, MYCOURT: 0xc1e9be6a,
};

// Player State values observed in PARK_PLAYERMANAGER::UpdateParkState 141741311.
const STATE = { WALKING: 0x9705bb0d, PENDING: 0xeb9084a3, GOT_NEXT: 0xca9b2162, LIMBO: 0xe1533af7, PLAYING: 0xecbccdf8 };

const u8 = v => Buffer.from([v & 0xff]);
const u16 = v => { const b = Buffer.alloc(2); b.writeUInt16LE(v & 0xffff); return b; };
const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
const i32 = v => { const b = Buffer.alloc(4); b.writeInt32LE(Math.round(v) | 0); return b; };
const u64 = v => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt.asUintN(64, BigInt(v))); return b; };
const vec4 = (x, y, z, w = 0) => { const b = Buffer.alloc(16); b.writeFloatLE(x, 0); b.writeFloatLE(y, 4); b.writeFloatLE(z, 8); b.writeFloatLE(w, 12); return b; };
const blob = data => Buffer.concat([u32(data.length), data]);

const ALL = { ...Base.byName, ...Court.byName };

// fields: Map/obj name -> value buffer, or name -> array of buffers (index -> buffer).
function encodeCourt(key, version, values) {
  const bits = Court.bits, map = new Map();
  for (const [name, value] of Object.entries(values)) {
    const def = ALL[name]; if (!def) throw new Error('Unknown court field ' + name);
    const list = Array.isArray(value) ? value : [value];
    if (list.length > def.count) throw new Error('Too many elements for ' + name);
    list.forEach((item, index) => {
      if (item === undefined || item === null) return;
      if (!Buffer.isBuffer(item)) throw new Error('Field ' + name + ' needs a Buffer');
      if (def.size !== 'var' && item.length !== def.size) throw new Error(`Field ${name} expects ${def.size} bytes, got ${item.length}`);
      map.set(def.bit + index, item);
    });
  }
  return encodeObject(key, version, bits, map);
}

function encodeObject(key, version, bits, map) {
  const head = Buffer.alloc(16), bitmap = Buffer.alloc(Math.ceil(bits / 8));
  head.writeBigUInt64BE(BigInt.asUintN(64, BigInt(key)), 0); head.writeBigUInt64BE(BigInt.asUintN(64, BigInt(version)), 8);
  const indexes = [...map.keys()].sort((a, b) => a - b);
  for (const i of indexes) { if (i < 0 || i >= bits) throw new Error('Bit outside schema'); bitmap[i >> 3] |= 128 >> (i & 7); }
  return Buffer.concat([head, bitmap, ...indexes.map(i => map.get(i))]);
}

// OBJECT_DATA envelope as already accepted by this client (mycourt-gameplay.cjs).
function wrapObject(key, classCrc, payload, connection) {
  const out = Buffer.alloc(32 + payload.length);
  out.writeUInt32LE(out.length, 0); out.writeUInt32BE(PACKET.ObjectData, 4);
  (connection || Buffer.alloc(8)).copy(out, 8, 0, 8);
  out.writeBigUInt64BE(BigInt.asUintN(64, BigInt(key)), 16); out.writeUInt32BE(classCrc >>> 0, 24); out.writeUInt32BE(payload.length, 28);
  payload.copy(out, 32); return out;
}

// Decodes an OBJECT_DATA court frame back into {bit: Buffer} using the schema.
function decodeCourtFrame(frame) {
  if (frame.readUInt32BE(4) !== PACKET.ObjectData || frame.readUInt32BE(24) !== CLASS.Court) throw new Error('Not a court frame');
  const payload = frame.subarray(32, 32 + frame.readUInt32BE(28));
  const bitmapLength = Math.ceil(Court.bits / 8), out = { key: payload.readBigUInt64BE(0), version: payload.readBigUInt64BE(8), fields: {} };
  const bitmap = payload.subarray(16, 16 + bitmapLength);
  const sizes = []; for (const def of Object.values(ALL)) for (let i = 0; i < def.count; i++) sizes[def.bit + i] = def.size;
  const names = []; for (const [name, def] of Object.entries(ALL)) for (let i = 0; i < def.count; i++) names[def.bit + i] = def.count > 1 ? `${name}[${i}]` : name;
  let at = 16 + bitmapLength;
  for (let bit = 0; bit < Court.bits; bit++) {
    if (!(bitmap[bit >> 3] & (128 >> (bit & 7)))) continue;
    const size = sizes[bit] === 'var' ? 4 + payload.readUInt32LE(at) : sizes[bit];
    out.fields[names[bit]] = payload.subarray(at, at + size); at += size;
  }
  if (at !== payload.length) throw new Error('Court frame length mismatch');
  return out;
}

module.exports = { decodeCourtFrame, Base, Court, CLASS, PACKET, CRC, STATE, encodeCourt, encodeObject, wrapObject, u8, u16, u32, i32, u64, vec4, blob };
