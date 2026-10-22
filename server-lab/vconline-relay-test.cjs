'use strict';
const assert = require('node:assert/strict'), dgram = require('node:dgram');
const { startRelay, header, TYPE, ROUTE, parseHeader } = require('./vconline-relay.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const relay = startRelay({ port: 0, host: '127.0.0.1' });
  await new Promise(r => relay.socket.once('listening', r));
  const port = relay.socket.address().port, token = Buffer.alloc(16, 0xab), relayId = 0x1234;
  const make = async machine => {
    const s = dgram.createSocket('udp4'), got = []; s.on('message', m => got.push(m));
    await new Promise(r => s.bind(0, '127.0.0.1', r));
    const c = Buffer.alloc(28); c.writeUInt32BE(header(TYPE.Connect, ROUTE.Delivered, 28, relayId), 0); token.copy(c, 4); c.writeBigUInt64BE(machine, 20);
    s.send(c, port, '127.0.0.1'); return { s, got, machine };
  };
  const a = await make(11n), b = await make(22n), c = await make(33n);
  await wait(50);
  for (const x of [a, b, c]) { const h = parseHeader(x.got[0]); assert.equal(h.type, TYPE.ConnectReply); assert.equal(x.got[0].readBigUInt64BE(8), x.machine); x.got.length = 0; }
  const data = (routing, payload, list) => {
    const extra = list ? Buffer.concat([Buffer.from([0, 0, 0, list.length]), ...list.map(m => { const q = Buffer.alloc(8); q.writeBigUInt64BE(m); return q; })]) : Buffer.alloc(0);
    const out = Buffer.alloc(4 + extra.length + payload.length); out.writeUInt32BE(header(TYPE.Unreliable, routing, out.length, relayId), 0); extra.copy(out, 4); payload.copy(out, 4 + extra.length); return out;
  };
  a.s.send(data(ROUTE.Others, Buffer.from('hello')), port, '127.0.0.1'); await wait(50);
  assert.equal(a.got.length, 0); assert.equal(b.got[0].subarray(4).toString(), 'hello'); assert.equal(c.got[0].subarray(4).toString(), 'hello');
  assert.equal(parseHeader(b.got[0]).routing, ROUTE.Delivered);
  b.got.length = c.got.length = 0;
  a.s.send(data(ROUTE.List, Buffer.from('only-c'), [33n]), port, '127.0.0.1'); await wait(50);
  assert.equal(b.got.length, 0); assert.equal(c.got[0].subarray(4).toString(), 'only-c');
  a.s.send(data(ROUTE.All, Buffer.from('all')), port, '127.0.0.1'); await wait(50);
  assert.equal(a.got.at(-1).subarray(4).toString(), 'all');
  // A different token is a different session.
  const other = dgram.createSocket('udp4'); const og = []; other.on('message', m => og.push(m)); await new Promise(r => other.bind(0, '127.0.0.1', r));
  const oc = Buffer.alloc(28); oc.writeUInt32BE(header(TYPE.Connect, ROUTE.Delivered, 28, relayId), 0); Buffer.alloc(16, 1).copy(oc, 4); oc.writeBigUInt64BE(44n, 20); other.send(oc, port, '127.0.0.1');
  await wait(50); og.length = 0; a.s.send(data(ROUTE.Others, Buffer.from('x')), port, '127.0.0.1'); await wait(50); assert.equal(og.length, 0);
  for (const x of [a.s, b.s, c.s, other]) x.close(); relay.close();
  console.log('vconline-relay-test PASS', relay.router.stats);
})().catch(e => { console.error(e); process.exit(1); });
