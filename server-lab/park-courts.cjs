'use strict';
// Park courts (Got Next) for NBA 2K22 — experimental.
//
// Client flow recovered from TK_WORLD::PARK_PLAYERMANAGER::UpdateParkState
// (141741311..141742C1B) and UpdateGameState (141739266):
//   1. The server publishes COURT objects (0x2C4D49E3) carrying GotNextSpotsSetup
//      areas. GOTNEXT_AREA_DETECTOR detects the local player inside an area.
//   2. The client sends REQUEST 0xCE148FB1 to the court key with
//      COMMAND=JOIN (0x1EF43563) and AREA=<spot index>.
//   3. The server answers by publishing the Player object with
//      State=GOT_NEXT (0xCA9B2162) and CourtName=<court Name>.
//   4. When the court is full the server fills Home/Away teams, MatchId,
//      RandomSeed and the lockstep relay endpoint (Uuid/Address/Port/VPort),
//      sets ObjectState=2 (lockstep requires exactly 2 in UpdateGameState)
//      and publishes every participant with State=PLAYING.
//   5. Clients send READY (0xDFC1471F); the server then sets ObjectState=3.
//   6. COMMAND 0xDAEAFE9E (RESULT=WON/...) ends the game; players return to WALKING.
// LEAVE (0x6CE44260) gives up a spot.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const S = require('./park-schema.cjs');
const codec = require(process.env.REFERENCE_OPAL_CODEC || require('./reference-codecs.cjs').opalPath());

const DEFAULT_CONFIG = {
  presence: true, soloStart: true, requestAck: true, echoPlayerOnHandshake: true, soloDelayMs: 1500, readyTimeoutMs: 10000,
  relay: { address: '127.0.0.1', port: 21023 }, courts: [],
};
const COURT_TYPE_BY_TEAM = { 1: 6, 2: 5, 3: 4 }; // 2K19 reference values; override per court.
const STEP = 120, EXIT = 160;

// ---------- geometry ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
function flatUnit(v, fallback = [0, 0, 1]) { const l = Math.hypot(v[0], v[2]); return l < 1e-3 ? fallback : [v[0] / l, 0, v[2] / l]; }
const facingUnits = dir => Math.round(Math.atan2(dir[0], dir[2]) * 32768 / Math.PI);

function courtId(name) { return (zlib.crc32 ? zlib.crc32('PARK_COURT_' + name) : crcFallback('PARK_COURT_' + name)) >>> 0; }
function crcFallback(text) { let c = ~0; for (const ch of Buffer.from(text)) { c ^= ch; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; }
const courtKey = id => (0x5041524bn << 32n) | BigInt(id >>> 0); // 'PARK' << 32 | id

// A quadra do Park tem colisão em volta (normal também no servidor oficial): ninguém entra andando.
// Por isso o centro é opcional — sem ele usamos o meio entre os dois pontos de espera (Casa/Visitante),
// que ficam do lado de fora, onde ficavam os tapetes de Got Next.
const isPoint = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
function centerOf(def) {
  if (isPoint(def.center)) return def.center.map(Number);
  if (isPoint(def.home) && isPoint(def.away)) return mul(add(def.home, def.away), 0.5);
  return null;
}
function geometry(def) {
  const center = centerOf(def);
  if (!center) throw new Error(`Court ${def.name} has no center (marque Centro, ou Casa e Visitante)`);
  const n = Math.max(1, Math.min(5, def.teamSize | 0 || 3));
  const pos = center;
  // Sem cesta marcada: a quadra corre perpendicular à linha Casa→Visitante.
  const across = isPoint(def.home) && isPoint(def.away) ? flatUnit(sub(def.away, def.home), null) : null;
  const forward = isPoint(def.basket) ? flatUnit(sub(def.basket, pos)) : across ? [-across[2], 0, across[0]] : [0, 0, 1];
  const right = [forward[2], 0, -forward[0]];
  const marks = [def.home || add(pos, mul(right, -842)), def.away || add(pos, mul(right, 842))];
  const ends = [def.homeEnd, def.awayEnd];
  const queues = marks.map((mark, index) => {
    let first, side, toCourt, spacing = STEP;
    if (isPoint(ends[index]) && Math.hypot(ends[index][0] - mark[0], ends[index][2] - mark[2]) > 30) {
      // Fileira marcada pelas duas pontas (1º e último spot): spots distribuídos entre elas.
      side = flatUnit(sub(ends[index], mark));
      spacing = n > 1 ? Math.hypot(ends[index][0] - mark[0], ends[index][2] - mark[2]) / (n - 1) : STEP;
      first = mark.map(Number);
      const middle = add(first, mul(side, spacing * (n - 1) / 2));
      const perp = [-side[2], 0, side[0]], away = sub(pos, middle);
      toCourt = Math.hypot(away[0], away[2]) > 50 && perp[0] * away[0] + perp[2] * away[2] < 0 ? mul(perp, -1) : perp;
    } else {
      toCourt = flatUnit(sub(pos, mark), index ? mul(right, -1) : right);
      side = [toCourt[2], 0, -toCourt[0]];
      first = sub(mark, mul(side, STEP * (n - 1) / 2));
    }
    // inset: a faixa dos tapetes fica atrás da colisão da quadra. O jogador pára do lado de fora
    // (onde marcou), aperta X e o comportamento GoGetNext o leva até o tapete. Por isso a área de
    // detecção começa no corredor (-150) e vai até o tapete; o tapete fica "inset" cm para dentro.
    const inset = Number.isFinite(Number(def.inset)) ? Number(def.inset) : 0;
    const mark0 = first;
    first = add(first, mul(toCourt, inset));
    const exit = sub(mark0, mul(toCourt, EXIT));
    const length = spacing * (n - 1) + 60;
    const corners = [[-60, -150], [-60, inset + 100], [length, inset + 100], [length, -150]].map(([a, b]) => add(add(mark0, mul(side, a)), mul(toCourt, b)));
    return { first, step: mul(side, spacing), exit, facing: facingUnits(toCourt), corners, count: n };
  });
  const yaw = Math.atan2(forward[0], forward[2]);
  return { n, pos, yaw, queues, forward, right };
}

function transform(g) {
  const c = Math.cos(g.yaw), s = Math.sin(g.yaw), b = Buffer.alloc(64);
  [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, g.pos[0], g.pos[1], g.pos[2], 1].forEach((v, i) => b.writeFloatLE(Math.abs(v) < 1e-7 ? 0 : v, i * 4));
  return b;
}

// GotNextSpotsSetup record (0x90). Offsets confirmed in 2K22 consumers:
// +0x60 corners (14169C539), +0x80 count (1416AF9C6), +0x84 flag, +0x88 mode (1416BFA16).
function setupRecord(q, index) {
  const r = Buffer.alloc(0x90);
  const v = (o, p, w = 0) => { r.writeFloatLE(p[0], o); r.writeFloatLE(p[1], o + 4); r.writeFloatLE(p[2], o + 8); r.writeFloatLE(w, o + 12); };
  v(0x00, q.first); v(0x10, q.step); r.writeInt32LE(q.facing, 0x20);
  v(0x30, q.exit); v(0x40, q.step); r.writeInt32LE(q.facing, 0x50);
  q.corners.forEach((p, i) => { r.writeFloatLE(p[0], 0x60 + i * 8); r.writeFloatLE(p[2], 0x64 + i * 8); });
  r.writeUInt32LE(q.count, 0x80); r[0x84] = 0; r[0x85] = index === 0 ? 1 : 0; r.writeUInt32LE(0, 0x88);
  return r;
}

// GotNextSpots record (0x48): holders u64 at +8.. (1416BFA2C tests +8), eligibility at +0x38.
function spotRecord(holders) {
  const r = Buffer.alloc(0x48);
  holders.slice(0, 6).forEach((id, i) => { if (id) r.writeBigUInt64LE(BigInt.asUintN(64, BigInt(id)), 8 + i * 8); });
  r.writeUInt32LE(0, 0x38); return r;
}

// ---------- hub (shared by every world socket in this process) ----------
function loadConfig(lab) {
  const file = path.join(lab, 'park-courts.json');
  const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  return { ...DEFAULT_CONFIG, ...raw, relay: { ...DEFAULT_CONFIG.relay, ...(raw.relay || {}) }, courts: Array.isArray(raw.courts) ? raw.courts : [] };
}
function saveConfig(lab, config) {
  const file = path.join(lab, 'park-courts.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(config, null, 2)); fs.renameSync(file + '.tmp', file);
}

function createHub(lab, log = () => {}) {
  const hub = { lab, log, peers: new Map(), courts: new Map(), nextPeer: 1, config: loadConfig(lab), lastMover: null };

  hub.reload = () => {
    hub.config = loadConfig(lab);
    const keep = new Set();
    for (const def of hub.config.courts) {
      if (!def || !def.name || !centerOf(def)) continue;
      const id = courtId(def.name), key = courtKey(id); keep.add(key);
      const g = geometry(def), old = hub.courts.get(key);
      hub.courts.set(key, {
        def, id, key, g, version: old ? old.version : 1n,
        queues: old && old.queues.length === 2 && old.queues[0].length === g.n ? old.queues : [Array(g.n).fill(0n), Array(g.n).fill(0n)],
        game: old ? old.game : null,
      });
    }
    for (const key of [...hub.courts.keys()]) if (!keep.has(key)) hub.courts.delete(key);
    return hub.courts.size;
  };
  hub.reload();

  hub.courtFor = target => {
    if (hub.courts.has(target)) return hub.courts.get(target);
    const low = Number(target & 0xffffffffn) >>> 0;
    return [...hub.courts.values()].find(c => c.id === low) || null;
  };

  hub.courtFrame = (court, peer) => {
    const g = court.g, game = court.game, n = g.n;
    const team = list => Array.from({ length: 5 }, (_, i) => S.u64(list[i] || 0n));
    const flags = (list, v) => Array.from({ length: 5 }, (_, i) => S.u8(list[i] ? v : 0));
    const values = {
      Name: S.u32(court.id), IsActiveFlag: S.u8(1), Transform: transform(g),
      ObjectState: S.u32(game ? game.objectState : 0), IsLockstep: S.u8(game && game.lockstep ? 1 : 0),
      CourtType: S.u32(court.def.courtType ?? COURT_TYPE_BY_TEAM[n] ?? 4), FlipDirectionOfPlay: S.u8(court.def.flip ? 1 : 0),
      IsHalfCourt: S.u8(court.def.halfCourt === false ? 0 : 1), StartType: S.u32(0),
      NumberOfAwayTeam: S.u8(game ? game.away.length : 0), AwayTeam: team(game ? game.away : []),
      AwayTeamConfirmed: flags(game ? game.away : [], 1), AwayTeamPrepared: flags(game ? game.away : [], 1),
      NumberOfHomeTeam: S.u8(game ? game.home.length : 0), HomeTeam: team(game ? game.home : []),
      HomeTeamPrepared: flags(game ? game.home : [], 1), HomeTeamConfirmed: flags(game ? game.home : [], 1),
      GamePreparedValid: S.u8(game ? 1 : 0),
      NumberOfGotNextSpots: S.u8(2), GotNextSpots: court.queues.map(spotRecord), GotNextSpotsSetup: g.queues.map(setupRecord),
      WinnerStartLocation: S.vec4(...g.queues[0].first, 1), WinnerOffset: S.vec4(...g.queues[0].step, 0), WinnerFacing: S.i32(g.queues[0].facing),
      LoserStartLocation: S.vec4(...g.queues[1].exit, 1), LoserOffset: S.vec4(...g.queues[1].step, 0), LoserFacing: S.i32(g.queues[1].facing),
      HomeSpotCount: S.u8(n), AwaySpotCount: S.u8(n), UtilityPlayerCount: S.u8(0),
    };
    if (game) {
      Object.assign(values, {
        MatchId: S.u64(game.matchId), RandomSeed: S.u64(game.seed), ByteMatchCode: S.u32(0),
        GameStartTime: S.u64(BigInt(game.startedAt)),
      });
      if (game.lockstep) Object.assign(values, {
        Uuid: game.token, Address: S.u32(ipv4(hub.config.relay.address)), Port: S.u16(hub.config.relay.port), VPort: S.u16(game.relayId),
      });
      const blobs = list => list.map(id => { const p = hub.byPuid(id); return p && p.userdata ? S.blob(p.userdata) : undefined; });
      if (game.home.some(id => hub.byPuid(id)?.userdata)) values.HomeUserData = blobs(game.home);
      if (game.away.some(id => hub.byPuid(id)?.userdata)) values.AwayUserData = blobs(game.away);
    }
    court.version += 1n;
    return S.wrapObject(court.key, S.CLASS.Court, S.encodeCourt(court.key, court.version, values), peer.connection);
  };

  hub.parkPeers = () => [...hub.peers.values()].filter(p => p.inPark && !p.closed && p.connection);
  hub.byPuid = puid => [...hub.peers.values()].find(p => !p.closed && p.puid === BigInt(puid)) || null;
  hub.broadcastCourt = court => { for (const p of hub.parkPeers()) if (p.courtsPublished) p.send(hub.courtFrame(court, p)); };
  hub.publishCourts = peer => { for (const court of hub.courts.values()) peer.send(hub.courtFrame(court, peer)); peer.courtsPublished = true; return hub.courts.size; };

  hub.playerFrame = (owner, recipient) => S.wrapObject(owner.puid, S.CLASS.Player, owner.body, recipient.connection);
  hub.publishPlayer = (owner, toSelf = true) => {
    owner.version += 1n; owner.body.writeBigUInt64BE(owner.version, 8);
    if (toSelf) owner.send(hub.playerFrame(owner, owner));
    if (hub.config.presence) for (const p of hub.parkPeers()) if (p !== owner && p.body) p.send(hub.playerFrame(owner, p));
  };
  hub.setState = (peer, state, court) => {
    if (!peer.body) return false;
    peer.body.writeUInt32LE(state >>> 0, 69); peer.body.writeUInt32LE(court ? court.id : 0, 73);
    peer.state = state; hub.publishPlayer(peer); return true;
  };

  hub.seatOf = puid => { for (const court of hub.courts.values()) for (let q = 0; q < 2; q++) { const i = court.queues[q].indexOf(puid); if (i >= 0) return { court, q, i }; } return null; };
  hub.release = (puid, quiet) => {
    const seat = hub.seatOf(puid); if (!seat) return null;
    seat.court.queues[seat.q][seat.i] = 0n;
    if (seat.court.game && [...seat.court.game.home, ...seat.court.game.away].includes(puid)) hub.endGame(seat.court, 'participant-left');
    else if (!quiet) hub.broadcastCourt(seat.court);
    return seat.court;
  };

  hub.join = (peer, court, area) => {
    if (court.game) return { ok: false, reason: 'court-busy' };
    const previous = hub.seatOf(peer.puid);
    if (previous) previous.court.queues[previous.q][previous.i] = 0n;
    let q = area === 1 ? 1 : 0; let i = court.queues[q].indexOf(0n);
    if (i < 0) { q ^= 1; i = court.queues[q].indexOf(0n); }
    if (i < 0) { if (previous) previous.court.queues[previous.q][previous.i] = peer.puid; return { ok: false, reason: 'court-full' }; }
    court.queues[q][i] = peer.puid;
    if (previous && previous.court !== court) hub.broadcastCourt(previous.court);
    hub.setState(peer, S.STATE.GOT_NEXT, court);
    hub.broadcastCourt(court);
    hub.maybeStart(court, peer);
    return { ok: true, queue: q, seat: i };
  };

  hub.maybeStart = (court, peer) => {
    if (court.game) return false;
    const home = court.queues[0].filter(Boolean), away = court.queues[1].filter(Boolean);
    const full = home.length === court.g.n && away.length === court.g.n;
    const others = hub.parkPeers().filter(p => p !== peer && p.body).length;
    const solo = hub.config.soloStart && home.length + away.length === 1 && (others === 0 || hub.config.soloStart === 'always');
    if (!full && !solo) return false;
    const begin = () => {
      if (court.game) return;
      const h = court.queues[0].filter(Boolean), a = court.queues[1].filter(Boolean);
      if (!(h.length === court.g.n && a.length === court.g.n) && !(solo && h.length + a.length === 1)) return;
      hub.startGame(court, solo ? [...h, ...a] : h, solo ? [] : a, !solo);
    };
    if (solo) { const t = setTimeout(begin, hub.config.soloDelayMs); t.unref?.(); } else begin();
    return true;
  };

  hub.startGame = (court, home, away, lockstep) => {
    const players = [...home, ...away].map(id => hub.byPuid(id));
    if (players.some(p => !p || !p.body)) { log({ event: 'park-start-withheld', reason: 'participant-missing', court: court.def.name }); return false; }
    court.game = {
      home, away, lockstep, objectState: lockstep ? 2 : 3, matchId: crypto.randomBytes(8).readBigUInt64BE() || 1n,
      seed: crypto.randomBytes(8).readBigUInt64BE(), token: crypto.randomBytes(16), relayId: (crypto.randomBytes(2).readUInt16BE() & 0x7fff) | 1,
      startedAt: Math.floor(Date.now() / 1000), ready: new Set(),
    };
    if (lockstep && hub.relay) hub.relay.allow(court.game.token, court.game.relayId, players.map(p => p.machine || p.puid));
    hub.broadcastCourt(court);
    for (const p of players) hub.setState(p, S.STATE.PLAYING, court);
    log({ event: 'park-game-start', court: court.def.name, home: home.length, away: away.length, lockstep, userdata: players.filter(p => p.userdata).length });
    if (lockstep) { const t = setTimeout(() => hub.markReady(court, null, true), hub.config.readyTimeoutMs); t.unref?.(); court.game.readyTimer = t; }
    return true;
  };

  hub.markReady = (court, puid, timeout) => {
    const game = court.game; if (!game || game.objectState === 3) return;
    if (puid) game.ready.add(puid);
    const all = [...game.home, ...game.away];
    if (timeout || all.every(id => game.ready.has(id))) {
      game.objectState = 3; clearTimeout(game.readyTimer); hub.broadcastCourt(court);
      log({ event: 'park-game-ready', court: court.def.name, ready: game.ready.size, total: all.length, timeout: !!timeout });
    }
  };

  hub.endGame = (court, reason, result) => {
    const game = court.game; if (!game) return;
    clearTimeout(game.readyTimer);
    const all = [...game.home, ...game.away];
    court.game = null; court.queues = [Array(court.g.n).fill(0n), Array(court.g.n).fill(0n)];
    if (hub.relay) hub.relay.forget(game.token);
    hub.broadcastCourt(court);
    for (const id of all) { const p = hub.byPuid(id); if (p) hub.setState(p, S.STATE.WALKING, null); }
    log({ event: 'park-game-end', court: court.def.name, reason, result: result === undefined ? null : '0x' + (result >>> 0).toString(16) });
  };

  // ---------- calibration ----------
  hub.mark = ({ court: name, point, teamSize, courtType, inset, puid }) => {
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(String(name || ''))) throw new Error('Nome de quadra inválido (use letras/números, até 24)');
    if (!['center', 'basket', 'home', 'homeEnd', 'away', 'awayEnd'].includes(point)) throw new Error('Ponto deve ser center, basket, home, homeEnd, away ou awayEnd');
    const source = puid ? hub.byPuid(puid) : hub.lastMover;
    if (!source || !source.position) throw new Error('Nenhuma posição de jogador recebida ainda — ande um pouco no Park');
    const config = loadConfig(lab);
    let def = config.courts.find(c => c.name === name);
    if (!def) { def = { name, teamSize: 3 }; config.courts.push(def); }
    def[point] = [source.position.x, source.position.y, source.position.z];
    if (teamSize) def.teamSize = Math.max(1, Math.min(5, Number(teamSize) | 0));
    if (courtType !== undefined && courtType !== '') def.courtType = Number(courtType) >>> 0;
    if (inset !== undefined && inset !== '' && Number.isFinite(Number(inset))) def.inset = Math.max(-500, Math.min(800, Number(inset)));
    saveConfig(lab, config); hub.reload();
    const court = [...hub.courts.values()].find(c => c.def.name === name);
    if (court) hub.broadcastCourt(court);
    return { court: def, published: !!court };
  };
  hub.setInset = (name, inset) => {
    const value = Number(inset); if (!Number.isFinite(value)) throw new Error('Recuo inválido');
    const config = loadConfig(lab), def = config.courts.find(c => c.name === name);
    if (!def) throw new Error('Quadra não encontrada: ' + name);
    def.inset = Math.max(-500, Math.min(800, value)); saveConfig(lab, config); hub.reload();
    const court = [...hub.courts.values()].find(c => c.def.name === name); if (court) hub.broadcastCourt(court);
    return { court: def, published: !!court };
  };
  hub.removeCourt = name => {
    const config = loadConfig(lab); config.courts = config.courts.filter(c => c.name !== name);
    saveConfig(lab, config); return hub.reload();
  };
  hub.status = () => ({
    config: { presence: hub.config.presence, soloStart: hub.config.soloStart, relay: hub.config.relay },
    players: [...hub.peers.values()].filter(p => !p.closed).map(p => ({ peer: p.id, inPark: p.inPark, handshake: !!p.body, userdata: !!p.userdata, state: p.state ? '0x' + p.state.toString(16) : null, position: p.position, puidHash: p.puid ? crypto.createHash('sha256').update(String(p.puid)).digest('hex').slice(0, 8) : null })),
    courts: [...hub.courts.values()].map(c => ({ name: c.def.name, id: '0x' + c.id.toString(16), teamSize: c.g.n, courtType: c.def.courtType ?? COURT_TYPE_BY_TEAM[c.g.n], inset: c.def.inset ?? 0, center: c.g.pos.map(v => Math.round(v)), centerMarked: isPoint(c.def.center), hasBasket: !!c.def.basket, home: c.queues[0].filter(Boolean).length, away: c.queues[1].filter(Boolean).length, playing: !!c.game, objectState: c.game ? c.game.objectState : 0 })),
  });

  hub.attach = (send, label) => createPeer(hub, send, label);
  return hub;
}

function ipv4(text) { const p = String(text).split('.').map(Number); if (p.length !== 4 || p.some(x => !(x >= 0 && x <= 255))) throw new Error('Invalid relay IPv4'); return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0; }

// ---------- per-socket peer ----------
function createPeer(hub, send, label) {
  const peer = { id: hub.nextPeer++, label, send, inPark: false, closed: false, connection: null, puid: null, account: null, machine: null, body: null, version: 1n, state: null, userdata: null, position: null, courtsPublished: false };
  hub.peers.set(peer.id, peer);
  const log = hub.log;

  peer.bindEntry = (request, reply) => {
    if (!reply || reply.length < 16) return;
    const list = codec.Parse(request, 16);
    peer.inPark = codec.Find(list, 0x5cedb580)?.Data1 !== S.CRC.MYCOURT;
    const out = codec.Parse(reply, 16);
    peer.account = codec.Find(out, 0x3a60fe52)?.Value || null;
    peer.entryPuid = codec.Find(out, 0x693578b9)?.Value || null;
    peer.machine = codec.Find(out, 0xc56500f9)?.Value || null;
    peer.connection = Buffer.from(reply.subarray(8, 16));
    log({ event: 'park-peer-bound', peer: peer.id, inPark: peer.inPark });
  };

  function handshake(bytes) {
    const key = bytes.readBigUInt64BE(24);
    if (![peer.account, peer.entryPuid].filter(Boolean).includes(key)) return { event: 'park-handshake-foreign-identity' };
    const list = codec.Parse(bytes, 42), f = codec.Find(list, S.CRC.DATA);
    if (!f || f.Type !== codec.Type.BlobRef || list.DataOffset + f.Data1 + f.Data2 > bytes.length) return { event: 'park-handshake-no-blob' };
    const body = Buffer.from(bytes.subarray(list.DataOffset + f.Data1, list.DataOffset + f.Data1 + f.Data2));
    // Same validated 2K22 PLAYER prefix as mycourt-gameplay.cjs: Puid@37, State@69, CourtName@73.
    if (body.length < 77 || body.readBigUInt64BE(0) !== key || (body[16] & 0xfc) !== 0xfc || body.readBigUInt64LE(37) !== key) return { event: 'park-handshake-schema-mismatch' };
    peer.puid = key; peer.body = body; peer.version = body.readBigUInt64BE(8); peer.state = body.readUInt32LE(69);
    if (peer.machine) body.writeBigUInt64LE(peer.machine, 45);
    hub.publishPlayer(peer, hub.config.echoPlayerOnHandshake !== false);
    if (hub.config.presence) for (const other of hub.parkPeers()) if (other !== peer && other.body) peer.send(hub.playerFrame(other, peer));
    const courts = hub.publishCourts(peer);
    return { event: 'park-player-accepted', courts, peers: hub.parkPeers().length };
  }

  function movement(bytes) {
    const pos = { x: bytes.readInt16BE(16), y: bytes.readInt16BE(18), z: bytes.readInt16BE(20), heading: bytes[22], at: Date.now() };
    if (Math.abs(pos.x) > 10000 && pos.x === pos.y && pos.y === pos.z) return null; // "nowhere" sentinel
    peer.position = pos; hub.lastMover = peer;
    if (hub.config.presence && peer.puid) {
      const body = Buffer.alloc(11); body[0] = 0xc0; body.writeInt16BE(pos.x, 4); body.writeInt16BE(pos.y, 6); body.writeInt16BE(pos.z, 8); body[10] = pos.heading;
      for (const other of hub.parkPeers()) {
        if (other === peer || !other.body) continue;
        const frame = Buffer.alloc(32 + body.length);
        frame.writeUInt32LE(frame.length, 0); frame.writeUInt32BE(S.PACKET.ObjectUpdateList, 4); other.connection.copy(frame, 8);
        frame[16] = 1; frame.writeUInt32BE(S.CLASS.Position, 17); frame.writeUInt16BE(body.length + 16, 21);
        frame.writeBigUInt64BE(peer.puid, 23); frame[31] = body.length; body.copy(frame, 32); other.send(frame);
      }
    }
    return null;
  }

  function compressed(bytes) {
    const at = codec.Locate(bytes, 16, 96); if (at < 0) return null;
    const list = codec.Parse(bytes, at);
    if (codec.Find(list, S.CRC.COMMAND)?.Data1 !== S.CRC.USERDATA) return null;
    const f = codec.Find(list, S.CRC.COMPRESSED_DATA); if (!f) return null;
    const data = codec.ReadBlob(list, f); if (!data.length) return null;
    try { zlib.inflateSync(data, { maxOutputLength: 0x80000 }); } catch { return { event: 'park-userdata-invalid' }; }
    peer.userdata = Buffer.from(data);
    return { event: 'park-userdata-stored', bytes: data.length };
  }

  function ack(bytes) {
    if (!hub.config.requestAck) return;
    const out = Buffer.alloc(32); out.writeUInt32LE(32, 0); out.writeUInt32BE(S.PACKET.RequestAck, 4);
    const seq = bytes.readUInt32BE(20); out.writeUInt32BE(seq, 20); out.writeUInt32LE(bytes.readUInt32BE(8), 24); out.writeUInt32BE(seq, 28);
    peer.send(out);
  }

  function request(bytes) {
    const at = codec.Locate(bytes, 16, 96); if (at < 0) return null;
    const list = codec.Parse(bytes, at), command = codec.Find(list, S.CRC.COMMAND)?.Data1 >>> 0;
    if (![S.CRC.JOIN, S.CRC.LEAVE, S.CRC.READY, S.CRC.GAME_END].includes(command)) return null;
    const target = bytes.readBigUInt64BE(24), court = hub.courtFor(target);
    if (!court) return command === S.CRC.GAME_END || command === S.CRC.READY ? null : { event: 'park-request-unknown-court', command: '0x' + command.toString(16) };
    if (!peer.puid) return { event: 'park-request-before-handshake' };
    if (command === S.CRC.JOIN) {
      const area = codec.Find(list, S.CRC.AREA); const index = area ? (area.Value !== undefined ? Number(area.Value) : area.Data1) : 0;
      const result = hub.join(peer, court, index); ack(bytes);
      return { event: result.ok ? 'park-join' : 'park-join-refused', court: court.def.name, ...result };
    }
    if (command === S.CRC.LEAVE) {
      hub.release(peer.puid); hub.setState(peer, S.STATE.WALKING, null); ack(bytes);
      return { event: 'park-leave', court: court.def.name };
    }
    if (command === S.CRC.READY) { ack(bytes); hub.markReady(court, peer.puid); return { event: 'park-ready', court: court.def.name }; }
    const res = codec.Find(list, S.CRC.RESULT); ack(bytes);
    if (court.game && [...court.game.home, ...court.game.away].includes(peer.puid)) hub.endGame(court, 'client-result', res ? res.Data1 : undefined);
    return { event: 'park-game-result', court: court.def.name };
  }

  peer.handle = bytes => {
    if (!peer.inPark || bytes.length < 16 || bytes.readUInt32LE(0) !== bytes.length) return null;
    const id = bytes.readUInt32BE(4);
    if (id === S.PACKET.Movement && bytes.length >= 30) return movement(bytes);
    if (id === S.PACKET.PlayerHandshake && bytes.length >= 90 && bytes.readUInt32BE(32) === S.CLASS.Player) return handshake(bytes);
    if (id === S.PACKET.CompressedCommand) return compressed(bytes);
    if (id === S.PACKET.Request && bytes.length >= 52) return request(bytes);
    if (id === S.PACKET.ClientUpdate && peer.puid && bytes.length > 58 && bytes.readUInt32BE(32) === S.CLASS.Player && bytes.readBigUInt64BE(24) === peer.puid) {
      // Atualização do próprio PLAYER (request id em +16, payload = key,versão,bitmap,valores em +42).
      // O cliente deixa o pedido pendente até o servidor confirmar (REQUEST_ACK) E o objeto do servidor
      // chegar nessa versão (TK_WORLD::SERVER::UpdatePendingRequests 0x1742DC8). Enquanto há pedido
      // pendente, PARK_PLAYERMANAGER::UpdateParkState não roda — por isso o PLAYING não iniciava o jogo.
      const length = bytes.readUInt16BE(40); if (42 + length !== bytes.length) return null;
      const payload = bytes.subarray(42), version = payload.readBigUInt64BE(8);
      ack(bytes);
      if (version > peer.version) { peer.version = version; if (peer.body) peer.body.writeBigUInt64BE(version, 8); }
      peer.send(S.wrapObject(peer.puid, S.CLASS.Player, payload, peer.connection));
      if (hub.config.presence) for (const other of hub.parkPeers()) if (other !== peer && other.body) other.send(S.wrapObject(peer.puid, S.CLASS.Player, payload, other.connection));
      return null;
    }
    return null;
  };

  peer.close = () => {
    if (peer.closed) return; peer.closed = true;
    if (peer.puid) hub.release(peer.puid);
    hub.peers.delete(peer.id);
    if (hub.lastMover === peer) hub.lastMover = null;
  };
  return peer;
}

let shared = null;
function sharedHub(lab, log) { if (!shared) shared = createHub(lab, log); return shared; }

module.exports = { createHub, sharedHub, geometry, setupRecord, spotRecord, transform, courtId, courtKey, loadConfig, COURT_TYPE_BY_TEAM };
