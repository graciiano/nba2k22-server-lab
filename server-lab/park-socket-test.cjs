'use strict';
// Integration: real WebSocket transport + entry responder + Park hub + panel routes.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const WebSocket = require('ws');
const codec = require(process.env.REFERENCE_OPAL_CODEC || require('./reference-codecs.cjs').opalPath());
const S = require('./park-schema.cjs');

const lab = fs.mkdtempSync(path.join(os.tmpdir(), 'park-socket-')), captures = path.join(lab, 'captures');
fs.mkdirSync(captures);
const players = [1, 2].map(n => ({ n, puid: 0x0110000100000000n + BigInt(n), account: 0x0220000000000000n + BigInt(n) }));
fs.writeFileSync(path.join(lab, 'park-courts.enabled'), 'on');
fs.writeFileSync(path.join(lab, 'park-courts.json'), JSON.stringify({ soloStart: false, courts: [{ name: 'A', teamSize: 1, center: [0, 0, 0] }] }));
fs.writeFileSync(path.join(lab, 'world-entry.json'), JSON.stringify({ mode: 'single-player-bootstrap' }));
fs.writeFileSync(path.join(lab, 'world-route.json'), JSON.stringify({ url: 'ws://127.0.0.1:21023/Park/probe' }));
fs.writeFileSync(path.join(lab, 'sessions.json'), JSON.stringify(players.map(p => [String(1000 + p.n), { userId: String(p.account), worldPuid: String(p.puid) }])));

const responder = require('./world-entry-probe.cjs').createEntryResponder(lab);
const server = require('./world-capture-transport.cjs').createWorldCaptureTransport(captures, { replyBuilder: responder, replyMode: 'experimental-world-entry-single-player-bootstrap' });
const env = (packet, body, prefix = Buffer.alloc(0)) => { const out = Buffer.concat([Buffer.alloc(16), prefix, body]); out.writeUInt32LE(out.length, 0); out.writeUInt32BE(packet, 4); out.writeUInt32BE(0x5f000000 + 1, 8); return out; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const httpCall = (method, route) => new Promise((resolve, reject) => { const req = http.request({ host: '127.0.0.1', port: server.address().port, path: route, method }, res => { let t = ''; res.on('data', d => t += d); res.on('end', () => resolve({ status: res.statusCode, body: t })); }); req.on('error', reject); req.end(); });

async function connect(p) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/Park/probe`, 'chat');
  const got = []; ws.on('message', d => got.push(Buffer.from(d)));
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  ws.send(env(S.PACKET.Connect, new codec.Builder().AddU64(0x693578b9, p.puid).AddU64(0x3a60fe52, p.account).Build()));
  await wait(80);
  assert.equal(got[0].readUInt32BE(4), S.PACKET.Connect, 'entry reply');
  const body = Buffer.alloc(120); body.writeBigUInt64BE(p.puid, 0); body.writeBigUInt64BE(2n, 8); body[16] = 0xfc; body.writeBigUInt64LE(p.puid, 37); body.writeUInt32LE(S.STATE.WALKING, 69);
  const list = new codec.Builder().AddBlob(S.CRC.DATA, body).Build();
  const hs = Buffer.alloc(42 + list.length); hs.writeUInt32LE(hs.length, 0); hs.writeUInt32BE(S.PACKET.PlayerHandshake, 4); hs.writeBigUInt64BE(p.puid, 24); hs.writeUInt32BE(S.CLASS.Player, 32); hs.writeUInt16BE(list.length, 40); list.copy(hs, 42);
  ws.send(hs); await wait(80);
  return { ws, got, ...p };
}
const join = (c, key) => { const fl = new codec.Builder().AddU32(S.CRC.COMMAND, S.CRC.JOIN).AddU32(S.CRC.AREA, 0).Build(); const out = Buffer.alloc(36 + fl.length); out.writeUInt32LE(out.length, 0); out.writeUInt32BE(S.PACKET.Request, 4); out.writeBigUInt64BE(9n, 16); out.writeBigUInt64BE(key, 24); fl.copy(out, 36); c.ws.send(out); };
const courtsOf = got => got.filter(f => f.readUInt32BE(4) === S.PACKET.ObjectData && f.readUInt32BE(24) === S.CLASS.Court).map(S.decodeCourtFrame);

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const a = await connect(players[0]);
    const courts = courtsOf(a.got); assert.equal(courts.length, 1, 'court over the socket');
    assert.ok(a.got.some(f => f.length >= 24 && f.readUInt32BE(4) === S.PACKET.RequestAck), 'handshake acked');
    // Entry reply connection bytes are reused on every server frame.
    assert.ok(a.got.slice(1).filter(f => f.readUInt32BE(4) !== S.PACKET.RequestAck).every(f => f.subarray(8, 16).equals(a.got[0].subarray(8, 16))));
    const move = Buffer.alloc(30); move.writeUInt32LE(30, 0); move.writeUInt32BE(S.PACKET.Movement, 4); move.writeInt16BE(321, 16); move.writeInt16BE(5, 18); move.writeInt16BE(-654, 20); a.ws.send(move); await wait(50);
    // Atualização do próprio PLAYER: servidor confirma (REQUEST_ACK) e devolve o objeto na mesma versão.
    const upd = Buffer.alloc(42 + 20); upd.writeUInt32LE(upd.length, 0); upd.writeUInt32BE(S.PACKET.ClientUpdate, 4); upd.writeUInt32BE(0x5f000001, 8); upd.writeBigUInt64BE(7n, 16);
    upd.writeBigUInt64BE(a.puid, 24); upd.writeUInt32BE(S.CLASS.Player, 32); upd.writeUInt16BE(20, 40); upd.writeBigUInt64BE(a.puid, 42); upd.writeBigUInt64BE(9n, 50);
    const before = a.got.length; a.ws.send(upd); await wait(50);
    const after = a.got.slice(before);
    assert.ok(after.some(f => f.length >= 24 && f.readUInt32BE(4) === S.PACKET.RequestAck && f.readUInt32BE(20) === 7), 'player update acked');
    assert.ok(after.some(f => f.length >= 48 && f.readUInt32BE(4) === S.PACKET.ObjectData && f.readUInt32BE(24) === S.CLASS.Player && f.readBigUInt64BE(40) === 9n), 'player update echoed at client version');
    const status = JSON.parse((await httpCall('GET', '/park/status')).body);
    assert.deepEqual([status.players[0].position.x, status.players[0].position.z], [321, -654]);
    const mark = await httpCall('POST', '/park/mark?court=Z&point=center&teamSize=2'); assert.equal(mark.status, 200, mark.body);
    assert.ok(courtsOf(a.got).some(c => c.fields.Name.readUInt32LE(0) === require('./park-courts.cjs').courtId('Z')));
    assert.equal((await httpCall('GET', '/park')).status, 200);
    assert.ok(!fs.readdirSync(captures).some(f => f.endsWith('.bin') && fs.readFileSync(path.join(captures, f)).length === 30), 'movement not written to disk');

    const b = await connect(players[1]);
    assert.ok(b.got.some(f => f.readUInt32BE(24) === S.CLASS.Player && f.readBigUInt64BE(16) === a.puid), 'B receives A');
    join(a, courts[0].key); await wait(60); join(b, courts[0].key); await wait(80);
    const started = courtsOf(b.got).find(c => c.fields.GamePreparedValid?.[0] === 1);
    assert.ok(started, 'game started over the socket'); assert.equal(started.fields.ObjectState.readUInt32LE(0), 2);
    const status2 = JSON.parse((await httpCall('GET', '/park/status')).body);
    assert.equal(status2.courts.find(c => c.name === 'A').playing, true);
    a.ws.close(); await wait(80);
    const status3 = JSON.parse((await httpCall('GET', '/park/status')).body);
    assert.equal(status3.courts.find(c => c.name === 'A').playing, false, 'disconnect ends the game');
    b.ws.close();
    assert.ok(fs.readFileSync(path.join(lab, 'park-events.log'), 'utf8').includes('park-game-start'));
    console.log('park-socket-test PASS');
  } finally { await new Promise(r => server.close(r)); fs.rmSync(lab, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exit(1); });
