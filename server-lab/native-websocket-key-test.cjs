'use strict';
const assert=require('node:assert/strict'),net=require('node:net'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createWorldCaptureTransport}=require('./world-capture-transport.cjs');
const {isNativeKey}=require('./native-websocket-key.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nba-native-ws-'));
 const server=createWorldCaptureTransport(dir);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  for(const encoding of ['base64','base64url','observed-length']){
   const key=encoding==='observed-length'?crypto.randomBytes(24).toString('base64url').slice(0,31):crypto.randomBytes(256).toString(encoding);assert.ok(isNativeKey(key));
   const socket=net.connect(server.address().port,'127.0.0.1');await once(socket,'connect');
   socket.write('GET /Park/probe HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: '+key+'\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: chat, superchat\r\n\r\n');
   const [reply]=await once(socket,'data');const text=reply.toString();assert.match(text,/^HTTP\/1.1 101 /);
   const expected=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');assert.ok(text.includes('Sec-WebSocket-Accept: '+expected));
   const payload=Buffer.alloc(16);payload.writeUInt32LE(16);payload.writeUInt32BE(0x12345678,4);
   const frame=Buffer.concat([Buffer.from([0x82,0x90,1,2,3,4]),Buffer.from(payload.map((v,i)=>v^[1,2,3,4][i%4]))]);
   const event=once(server,'parkCapture');socket.write(frame);const [capture]=await event;assert.equal(capture.envelope.packetId,'0x12345678');socket.destroy();
   for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.json')))assert.ok(!fs.readFileSync(path.join(dir,f),'utf8').includes(key));
  }
  assert.equal(isNativeKey('invalid'),false);assert.equal(isNativeKey(Buffer.alloc(16).toString('base64')),false);
  assert.equal(isNativeKey('a'.repeat(30)),false);assert.equal(isNativeKey('a'.repeat(32)),false);assert.equal(isNativeKey('a'.repeat(30)+'\n'),false);
  console.log('PASS: observed 31-character and static 256-byte key candidates, original-key accept hash, masked frames, redaction and narrow validation');
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
