'use strict';
// UDP relay compatible with the VCONLINE relay framing used by the 2K world
// sessions and lockstep games (2K22 contains the same P2P control types:
// Leave 4149111C, Echo 41BF6BC3, Leader 5C85BD15, Connectivity 6E225397).
//
// Datagram header, one big-endian u32:
//   type:3 | routing:2 | length:11 | relayId:16
// type 0 Connect (28 bytes: header, token[16], machineId u64 BE)
// type 1 ConnectReply (16 bytes: header, status u32 BE, machineId u64 BE)
// type 2 Disconnect (12 bytes: header, machineId u64 BE)
// type 3 Unreliable / 4 Reliable data; routing 1 = explicit list
//   (u32 count + count * u64 machine ids), 2 = others, 3 = everybody.
// Delivered data uses routing 0 and the recipient's relayId.
const dgram = require('node:dgram');

const TYPE = { Connect: 0, ConnectReply: 1, Disconnect: 2, Unreliable: 3, Reliable: 4 };
const ROUTE = { Delivered: 0, List: 1, Others: 2, All: 3 };
const MAX = 0x7ff, IDLE_MS = 70000;

const header = (type, routing, length, relayId) => (((type & 7) << 29) | ((routing & 3) << 27) | ((length & MAX) << 16) | (relayId & 0xffff)) >>> 0;
function parseHeader(packet) {
  if (packet.length < 4) throw new Error('short relay datagram');
  const word = packet.readUInt32BE(0);
  const h = { type: word >>> 29, routing: (word >>> 27) & 3, length: (word >>> 16) & MAX, relayId: word & 0xffff };
  if (h.length !== packet.length) throw new Error('relay length mismatch');
  return h;
}

function createRouter(send, now = () => Date.now()) {
  const clients = new Map(); // endpoint -> client
  const allowed = new Map(); // token hex -> {relayId, machines}
  const stats = { connects: 0, datagrams: 0, delivered: 0, errors: 0 };
  const prune = () => { const old = now() - IDLE_MS; for (const [k, c] of clients) if (c.seen < old) clients.delete(k); };
  const deliver = (type, recipient, payload) => {
    const out = Buffer.alloc(4 + payload.length); out.writeUInt32BE(header(type, ROUTE.Delivered, out.length, recipient.relayId), 0); payload.copy(out, 4);
    send(out, recipient); stats.delivered++;
  };
  function handle(packet, remote) {
    prune();
    const h = parseHeader(packet), key = remote.address + ':' + remote.port;
    if (h.type === TYPE.Connect) {
      if (packet.length !== 28 || h.routing !== ROUTE.Delivered) throw new Error('bad relay connect');
      const token = Buffer.from(packet.subarray(4, 20)), machine = packet.readBigUInt64BE(20);
      if (!machine || token.equals(Buffer.alloc(16))) throw new Error('relay connect needs token and machine');
      const session = h.relayId + ':' + token.toString('hex');
      for (const [k, c] of clients) if (c.session === session && c.machine === machine) clients.delete(k);
      const client = { address: remote.address, port: remote.port, relayId: h.relayId, machine, session, token, seen: now() };
      clients.set(key, client); stats.connects++;
      const reply = Buffer.alloc(16); reply.writeUInt32BE(header(TYPE.ConnectReply, ROUTE.Delivered, 16, h.relayId), 0); reply.writeUInt32BE(0, 4); reply.writeBigUInt64BE(machine, 8);
      send(reply, client);
      return { kind: 'connect', members: [...clients.values()].filter(c => c.session === session).length, known: allowed.has(token.toString('hex')) };
    }
    const sender = clients.get(key);
    if (!sender) throw new Error('relay datagram from unregistered endpoint');
    if (h.relayId !== sender.relayId) throw new Error('relay id mismatch');
    sender.seen = now();
    if (h.type === TYPE.Disconnect) { clients.delete(key); return { kind: 'disconnect' }; }
    if (h.type !== TYPE.Unreliable && h.type !== TYPE.Reliable) throw new Error('unexpected relay type ' + h.type);
    let offset = 4, selected = null;
    if (h.routing === ROUTE.List) {
      const count = packet.readUInt32BE(4); offset = 8 + count * 8;
      if (offset > packet.length) throw new Error('relay recipient list overrun');
      selected = new Set(); for (let at = 8; at < offset; at += 8) selected.add(packet.readBigUInt64BE(at));
    } else if (h.routing !== ROUTE.Others && h.routing !== ROUTE.All) throw new Error('bad relay routing');
    const payload = packet.subarray(offset); let sent = 0; stats.datagrams++;
    for (const [k, c] of clients) {
      if (c.session !== sender.session) continue;
      if (h.routing === ROUTE.Others && k === key) continue;
      if (selected && !selected.has(c.machine)) continue;
      deliver(h.type, c, payload); sent++;
    }
    return { kind: 'data', sent };
  }
  return {
    handle, stats, clients,
    allow(token, relayId, machines) { allowed.set(Buffer.from(token).toString('hex'), { relayId, machines: machines.map(String) }); },
    forget(token) { allowed.delete(Buffer.from(token).toString('hex')); },
  };
}

function startRelay({ port, host = '127.0.0.1', log = () => {} }) {
  const socket = dgram.createSocket('udp4');
  const router = createRouter((buffer, to) => socket.send(buffer, to.port, to.address));
  socket.on('message', (packet, remote) => {
    try { const r = router.handle(packet, remote); if (r.kind !== 'data') log({ event: 'relay-' + r.kind, ...r }); }
    catch (e) { router.stats.errors++; if (router.stats.errors < 50 || router.stats.errors % 500 === 0) log({ event: 'relay-error', reason: e.message, bytes: packet.length }); }
  });
  socket.on('error', e => log({ event: 'relay-socket-error', code: e.code || 'unknown' }));
  socket.bind(port, host);
  return { socket, router, close: () => socket.close(), allow: router.allow, forget: router.forget };
}

module.exports = { createRouter, startRelay, header, parseHeader, TYPE, ROUTE };
