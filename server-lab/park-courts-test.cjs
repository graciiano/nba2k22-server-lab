'use strict';
// Synthetic end-to-end test of the Park courts hub (no game required).
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), zlib = require('node:zlib');
const codec = require(process.env.REFERENCE_OPAL_CODEC || require('./reference-codecs.cjs').opalPath());
const S = require('./park-schema.cjs');
const { createHub, geometry, courtId } = require('./park-courts.cjs');

const lab = fs.mkdtempSync(path.join(os.tmpdir(), 'park-test-'));
const write = (config) => fs.writeFileSync(path.join(lab, 'park-courts.json'), JSON.stringify(config));
const frame = (packet, conn, body, prefix = Buffer.alloc(0)) => {
  const out = Buffer.concat([Buffer.alloc(16), prefix, body]); out.writeUInt32LE(out.length, 0); out.writeUInt32BE(packet, 4); conn.copy(out, 8); return out;
};
function client(hub, n) {
  const conn = Buffer.from([0x60 + n, 0, 0, 0, 0, 0, 0, 0]);
  const puid = 0x0110000100000000n + BigInt(n), account = 0x0220000000000000n + BigInt(n), machine = 0x7700n + BigInt(n);
  const sent = [];
  const peer = hub.attach(f => sent.push(f), 'test' + n);
  const request = frame(S.PACKET.Connect, conn, new codec.Builder().AddU64(0x693578b9, puid).AddU64(0x3a60fe52, account).Build());
  const reply = frame(S.PACKET.Connect, conn, new codec.Builder().AddU64(0x693578b9, puid).AddU64(0x3a60fe52, account).AddU64(0xc56500f9, machine).Build());
  peer.bindEntry(request, reply);
  // PLAYER body: head(16) + 21-byte bitmap + Puid, MachineId, MiniGameId, MiniObjectId, State, CourtName...
  const body = Buffer.alloc(120); body.writeBigUInt64BE(puid, 0); body.writeBigUInt64BE(4n, 8); body[16] = 0xfc;
  body.writeBigUInt64LE(puid, 37); body.writeUInt32LE(S.STATE.WALKING, 69);
  const list = new codec.Builder().AddBlob(S.CRC.DATA, body).Build();
  const hs = Buffer.alloc(42 + list.length); hs.writeUInt32LE(hs.length, 0); hs.writeUInt32BE(S.PACKET.PlayerHandshake, 4); conn.copy(hs, 8);
  hs.writeBigUInt64BE(puid, 24); hs.writeUInt32BE(S.CLASS.Player, 32); hs.writeUInt16BE(list.length, 40); list.copy(hs, 42);
  const move = (x, y, z) => { const m = Buffer.alloc(30); m.writeUInt32LE(30, 0); m.writeUInt32BE(S.PACKET.Movement, 4); conn.copy(m, 8); m.writeInt16BE(x, 16); m.writeInt16BE(y, 18); m.writeInt16BE(z, 20); m[22] = 7; return peer.handle(m); };
  let seq = 1;
  const req = (target, fields) => {
    const b = new codec.Builder(); for (const [crc, v] of fields) b.AddU32(crc, v);
    const fl = b.Build(), out = Buffer.alloc(36 + fl.length); out.writeUInt32LE(out.length, 0); out.writeUInt32BE(S.PACKET.Request, 4); conn.copy(out, 8);
    out.writeBigUInt64BE(BigInt(seq++), 16); out.writeBigUInt64BE(target, 24); out.writeUInt32BE(fl.length, 32); fl.copy(out, 36); return peer.handle(out);
  };
  const userdata = () => { const fl = new codec.Builder().AddBlob(S.CRC.COMPRESSED_DATA, zlib.deflateSync(Buffer.alloc(4096, 7))).AddU32(S.CRC.COMMAND, S.CRC.USERDATA).Build(); return peer.handle(frame(S.PACKET.CompressedCommand, conn, fl, Buffer.alloc(12))); };
  return { peer, puid, sent, handshake: () => peer.handle(hs), move, req, userdata };
}
const courts = sent => sent.filter(f => f.readUInt32BE(4) === S.PACKET.ObjectData && f.readUInt32BE(24) === S.CLASS.Court).map(S.decodeCourtFrame);
const players = sent => sent.filter(f => f.readUInt32BE(4) === S.PACKET.ObjectData && f.readUInt32BE(24) === S.CLASS.Player).map(f => ({ key: f.readBigUInt64BE(16), state: f.readUInt32LE(32 + 69), court: f.readUInt32LE(32 + 73) }));
const u8 = b => b[0], u32 = b => b.readUInt32LE(0), u64 = b => b.readBigUInt64LE(0);

(async () => {
  // Schema consistency with runtime evidence collected in the Codex investigation.
  assert.equal(S.Court.bits, 148); assert.equal(S.Court.byName.CourtType.bit, 20); assert.equal(S.Court.byName.NumberOfAwayTeam.bit, 28);
  assert.equal(S.Court.byName.NumberOfHomeTeam.bit, 55); assert.equal(S.Court.byName.HomeTeam.bit, 56); assert.equal(S.Court.byName.GamePreparedValid.bit, 81);
  assert.equal(S.Court.byName.HomeSpotCount.bit, 98); assert.equal(S.Base.byName.ObjectState.bit, 9); assert.equal(S.Base.byName.MatchId.bit, 17);

  // Geometry: facing points to the court, corners enclose the spot line.
  const g = geometry({ name: 'G', teamSize: 2, center: [0, 0, 0], basket: [0, 0, 600], home: [-850, 0, 0], away: [850, 0, 0] });
  assert.equal(g.queues[0].facing, 16384); assert.equal(g.queues[1].facing, -16384);
  // Sem centro (a quadra tem parede): centro = meio entre Casa e Visitante, mesma orientação.
  const g2 = geometry({ name: 'H', teamSize: 2, home: [-850, 0, 0], away: [850, 0, 0] });
  // Fileiras marcadas pelas pontas: espaçamento e orientação vêm dos pontos.
  const g3 = geometry({ name: 'R', teamSize: 3, home: [1000, 0, -300], homeEnd: [1000, 0, 300], away: [-1000, 0, -300], awayEnd: [-1000, 0, 300] });
  assert.deepEqual(g3.queues[0].first, [1000, 0, -300]); assert.deepEqual(g3.queues[0].step.map(Math.round), [0, 0, 300]);
  assert.equal(g3.queues[0].facing, -16384); assert.equal(g3.queues[1].facing, 16384);
  // Recuo: tapete 200 cm para dentro (rumo à quadra), área de detecção começa 150 cm para fora da marca.
  const g4 = geometry({ name: 'I', teamSize: 3, inset: 200, home: [1000, 0, -300], homeEnd: [1000, 0, 300], away: [-1000, 0, -300], awayEnd: [-1000, 0, 300] });
  assert.deepEqual(g4.queues[0].first.map(Math.round), [800, 0, -300]);
  const xs = g4.queues[0].corners.map(c => Math.round(c[0])); assert.equal(Math.max(...xs), 1150); assert.equal(Math.min(...xs), 700);
  // Um clique por lado: fileira perpendicular ao olhar, tapete recuado na direção do olhar.
  const g5 = geometry({ name: 'F', teamSize: 3, inset: 100, home: [0, 0, 0], homeFacing: [1, 0, 0], away: [1000, 0, 0], awayFacing: [-1, 0, 0] });
  assert.deepEqual(g5.queues[0].first.map(Math.round), [100, 0, 120]); assert.equal(g5.queues[0].facing, 16384); assert.equal(g5.queues[1].facing, -16384);
  // Layout da 2K: atrás das cestas + lateral → 3 spots perto de cada cesta, na mesma lateral, olhando para dentro.
  const g6 = geometry({ name: 'K', teamSize: 3, inset: 100, along: 0.55, spacing: 120, endA: [0, 0, -1400], endB: [0, 0, 1400], lateral: [800, 0, 0] });
  assert.deepEqual(g6.pos, [0, 0, 0]); assert.equal(Math.round(g6.halfW), 800);
  assert.deepEqual(g6.queues[0].first.map(Math.round), [700, 0, -890]); assert.equal(g6.queues[0].facing, -16384);
  assert.deepEqual(g6.queues[1].first.map(Math.round), [700, 0, 650]); assert.equal(g6.queues[1].facing, -16384);
  const g7 = geometry({ name: 'K', teamSize: 3, inset: 100, along: 0.55, spacing: 120, endA: [0, 0, -1400], endB: [0, 0, 1400], lateral: [800, 0, 0], sameSide: false });
  assert.deepEqual(g7.queues[1].first.map(Math.round), [-700, 0, 650]); assert.equal(g7.queues[1].facing, 16384);
  assert.deepEqual(g2.pos, [0, 0, 0]); assert.equal(g2.queues[0].facing, 16384); assert.equal(g2.queues[1].facing, -16384);

  // ---- 1v1 lockstep game between two clients ----
  write({ presence: true, soloStart: false, readyTimeoutMs: 60000, courts: [{ name: 'A', teamSize: 1, center: [100, 0, 200], basket: [100, 0, 900] }] });
  const relayCalls = [];
  const hub = createHub(lab, () => {}); hub.relay = { allow: (...a) => relayCalls.push(['allow', ...a]), forget: t => relayCalls.push(['forget', t]) };
  const a = client(hub, 1), b = client(hub, 2);
  assert.equal(a.handshake().event, 'park-player-accepted');
  assert.equal(courts(a.sent).length, 1, 'court published after handshake');
  const court0 = courts(a.sent)[0];
  assert.equal(u32(court0.fields.Name), courtId('A')); assert.equal(u8(court0.fields.NumberOfGotNextSpots), 2);
  assert.equal(court0.fields['GotNextSpotsSetup[0]'].readUInt32LE(0x80), 1);
  assert.equal(b.handshake().event, 'park-player-accepted');
  assert.ok(players(a.sent).some(p => p.key === b.puid), 'presence: A sees B');
  assert.ok(players(b.sent).some(p => p.key === a.puid), 'presence: B sees A');
  a.move(120, 0, 210); assert.ok(b.sent.some(f => f.readUInt32BE(4) === S.PACKET.ObjectUpdateList && f.readBigUInt64BE(23) === a.puid), 'movement relayed');
  assert.equal(a.userdata().event, 'park-userdata-stored'); b.userdata();

  const key = court0.key;
  a.sent.length = 0;
  const j1 = a.req(key, [[S.CRC.COMMAND, S.CRC.JOIN], [S.CRC.AREA, 0]]);
  assert.equal(j1.event, 'park-join'); assert.equal(j1.queue, 0);
  const pa = players(a.sent).find(p => p.key === a.puid);
  assert.equal(pa.state, S.STATE.GOT_NEXT); assert.equal(pa.court, courtId('A'));
  assert.ok(a.sent.some(f => f.readUInt32BE(4) === S.PACKET.RequestAck), 'request acknowledged');
  assert.equal(u64(courts(a.sent).at(-1).fields['GotNextSpots[0]'].subarray(8)), a.puid);

  b.sent.length = 0;
  assert.equal(b.req(key, [[S.CRC.COMMAND, S.CRC.JOIN], [S.CRC.AREA, 0]]).queue, 1, 'second player moves to the free queue');
  const started = courts(b.sent).find(c => c.fields.GamePreparedValid && u8(c.fields.GamePreparedValid) === 1);
  assert.ok(started, 'game prepared');
  assert.equal(u32(started.fields.ObjectState), 2, 'lockstep start uses ObjectState 2 (UpdateGameState 1417393C1)');
  assert.equal(u8(started.fields.IsLockstep), 1); assert.equal(u8(started.fields.NumberOfHomeTeam), 1); assert.equal(u8(started.fields.NumberOfAwayTeam), 1);
  assert.equal(u64(started.fields['HomeTeam[0]']), a.puid); assert.equal(u64(started.fields['AwayTeam[0]']), b.puid);
  assert.equal(started.fields.Uuid.length, 16); assert.equal(started.fields.Address.readUInt32LE(0), 0x7f000001); assert.equal(started.fields.Port.readUInt16LE(0), 21023);
  assert.ok(started.fields['HomeUserData[0]'] && started.fields['AwayUserData[0]'], 'USERDATA carried');
  assert.ok(players(b.sent).filter(p => p.state === S.STATE.PLAYING).length >= 2, 'both players PLAYING');
  assert.equal(relayCalls[0][0], 'allow');

  a.sent.length = 0; a.req(key, [[S.CRC.COMMAND, S.CRC.READY]]); assert.equal(courts(a.sent).length, 0, 'waits for every READY');
  b.req(key, [[S.CRC.COMMAND, S.CRC.READY]]);
  assert.equal(u32(courts(a.sent).at(-1).fields.ObjectState), 3, 'all READY -> ObjectState 3');

  a.sent.length = 0; a.req(key, [[S.CRC.COMMAND, S.CRC.GAME_END], [S.CRC.RESULT, S.CRC.WON]]);
  const ended = courts(a.sent).at(-1);
  assert.equal(u8(ended.fields.GamePreparedValid), 0); assert.equal(u8(ended.fields.NumberOfHomeTeam), 0); assert.equal(u32(ended.fields.ObjectState), 0);
  assert.equal(players(a.sent).find(p => p.key === a.puid).state, S.STATE.WALKING);
  assert.equal(relayCalls.at(-1)[0], 'forget');

  // LEAVE restores WALKING and frees the seat.
  a.req(key, [[S.CRC.COMMAND, S.CRC.JOIN], [S.CRC.AREA, 1]]); a.sent.length = 0;
  assert.equal(a.req(key, [[S.CRC.COMMAND, S.CRC.LEAVE]]).event, 'park-leave');
  assert.equal(players(a.sent).find(p => p.key === a.puid).state, S.STATE.WALKING);
  assert.equal(hub.seatOf(a.puid), null);

  // Disconnect releases seats.
  a.req(key, [[S.CRC.COMMAND, S.CRC.JOIN], [S.CRC.AREA, 0]]); a.peer.close(); assert.equal(hub.seatOf(a.puid), null); b.peer.close();

  // ---- calibration through movement ----
  const c = client(hub, 3); c.handshake(); c.move(-1500, 0, 3000);
  hub.mark({ court: 'B', point: 'center', teamSize: 2 }); c.move(-1500, 0, 3700); hub.mark({ court: 'B', point: 'basket' });
  const saved = JSON.parse(fs.readFileSync(path.join(lab, 'park-courts.json'), 'utf8')).courts.find(x => x.name === 'B');
  assert.deepEqual(saved.center, [-1500, 0, 3000]); assert.deepEqual(saved.basket, [-1500, 0, 3700]); assert.equal(saved.teamSize, 2);
  assert.ok(courts(c.sent).some(x => u32(x.fields.Name) === courtId('B')), 'calibrated court is published immediately');
  assert.throws(() => hub.mark({ court: 'B', point: 'nowhere' }));
  c.peer.close();

  // ---- solo start (single client, non-lockstep) ----
  write({ presence: true, soloStart: true, soloDelayMs: 10, courts: [{ name: 'A', teamSize: 3, center: [0, 0, 0] }] });
  const solo = createHub(lab, () => {}); const s = client(solo, 9); s.handshake();
  const skey = courts(s.sent)[0].key; s.req(skey, [[S.CRC.COMMAND, S.CRC.JOIN], [S.CRC.AREA, 0]]);
  await new Promise(r => setTimeout(r, 60));
  const soloGame = courts(s.sent).find(x => u8(x.fields.GamePreparedValid) === 1);
  assert.ok(soloGame, 'solo game prepared'); assert.equal(u8(soloGame.fields.IsLockstep), 0); assert.equal(u32(soloGame.fields.ObjectState), 3);
  assert.equal(players(s.sent).at(-1).state, S.STATE.PLAYING);
  // Sozinho: 1x1 contra uma cópia (nunca time vazio — isso derruba o jogo).
  assert.equal(u8(soloGame.fields.NumberOfHomeTeam), 1); assert.equal(u8(soloGame.fields.NumberOfAwayTeam), 1);
  assert.equal(u8(soloGame.fields.HomeSpotCount), 1); assert.equal(u8(soloGame.fields.AwaySpotCount), 1);
  assert.notEqual(soloGame.fields['AwayTeam[0]'].readBigUInt64LE(0), 0n);

  // ---- real 2K22 movement capture, if available ----
  const capture = process.env.PARK_MOVEMENT_CAPTURE;
  if (capture && fs.existsSync(capture)) {
    const m = fs.readFileSync(capture); const r = client(solo, 10); r.handshake(); r.peer.handle(m);
    assert.deepEqual([r.peer.position.x, r.peer.position.y, r.peer.position.z], [m.readInt16BE(16), m.readInt16BE(18), m.readInt16BE(20)]);
    console.log('real movement capture decoded:', r.peer.position);
  }
  fs.rmSync(lab, { recursive: true, force: true });
  console.log('park-courts-test PASS');
})().catch(e => { console.error(e); process.exit(1); });
