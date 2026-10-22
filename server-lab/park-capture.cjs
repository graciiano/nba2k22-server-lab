'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {WebSocketServer}=require('ws');
function decodeEnvelope(bytes) {
 if(bytes.length<16) throw new Error('Short inner envelope');
 const length=bytes.readUInt32LE(0);
 if(length!==bytes.length)throw new Error('Inner envelope length mismatch');
 return {length,packetId:'0x'+bytes.readUInt32BE(4).toString(16).toUpperCase().padStart(8,'0'),connectionBytes:bytes.subarray(8,16).toString('hex'),bodyLength:bytes.length-16};
}
function attachParkCapture(server,captureDir,options={}) {
 const wss=new WebSocketServer({noServer:true,maxPayload:1024*1024,handleProtocols:protocols=>protocols.has('chat')?'chat':false});
 const nativeKey=require('./native-websocket-key.cjs');
 wss.on('headers',nativeKey.restoreNativeAccept);
 server.on('upgrade',(req,socket,head)=>{
  // This path is for controlled experiments; the client's actual Park URL is unresolved.
  const route=new URL(req.url,'https://localhost');
  const upgradeId=Date.now()+'-upgrade-'+crypto.randomBytes(4).toString('hex');
  const key=req.headers['sec-websocket-key'];
  const summary={event:'ws-upgrade-request',route:route.pathname,queryNames:[...route.searchParams.keys()],headerNames:Object.keys(req.headers),keyLength:typeof key==='string'?key.length:0,keyRfcShape:typeof key==='string'&&/^[+/0-9A-Za-z]{22}==$/.test(key),versionSupported:['13','8'].includes(req.headers['sec-websocket-version'])};
  const write=()=>fs.writeFileSync(path.join(captureDir,upgradeId+'.json'),JSON.stringify(summary,null,2));
  write();
  const originalWrite=socket.write;
  socket.write=function(chunk,...args){const line=Buffer.isBuffer(chunk)?chunk.toString('ascii',0,80):String(chunk).slice(0,80);const match=/^HTTP\/1\.1 (\d{3})/.exec(line);if(match){summary.responseStatus=Number(match[1]);write();socket.write=originalWrite;}return originalWrite.call(this,chunk,...args);};
  if(route.pathname!=='/Park/probe'){socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');return;}
  summary.nativeKeyCompatibility=nativeKey.prepareNativeKey(req);write();
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',(ws,req)=>{
  let entryReplySent=false,travelReplySent=false;
  const gameplay=fs.existsSync(path.join(path.dirname(captureDir),'mycourt-gameplay.enabled'))?require('./mycourt-gameplay.cjs').createMyCourtGameplay():null;
  // Park courts / presence: one shared hub for every world socket of this process.
  const lab=path.dirname(captureDir);
  const park=fs.existsSync(path.join(lab,'park-courts.enabled'))?require('./park-courts.cjs').sharedHub(lab,parkLogger(lab)).attach(frame=>{if(ws.readyState===1)ws.send(frame);},req.socket.remoteAddress):null;
  const captureAll=process.env.CAPTURE_ALL==='1'||!park;
  ws.on('close',()=>{if(park)park.close();});
  ws.on('error',()=>{});
  ws.on('message',(data,isBinary)=>{
   const bytes=Buffer.from(data);const id=Date.now()+'-ws-'+crypto.randomBytes(4).toString('hex');
   let decoded,error;try{decoded=decodeEnvelope(bytes);}catch(e){error=e.message;}
   // Movement (0xCE1C9E8C) arrives many times per second; with the Park hub it is not written to disk.
   if(!captureAll&&decoded&&decoded.packetId==='0xCE1C9E8C'){try{park.handle(bytes);}catch(e){}return;}
   fs.writeFileSync(path.join(captureDir,id+'.bin'),bytes);
   // Preserve connection identifier only in raw capture; omit from summary.
   const summary={route:new URL(req.url,'https://localhost').pathname,isBinary,bytes:bytes.length,error,envelope:decoded?{length:decoded.length,packetId:decoded.packetId,bodyLength:decoded.bodyLength}:null};
   fs.writeFileSync(path.join(captureDir,id+'.json'),JSON.stringify(summary,null,2));
   server.emit('parkCapture',summary);
   if(isBinary&&decoded&&!travelReplySent&&options.travelReplyBuilder){
    try{const reply=options.travelReplyBuilder(bytes);if(reply){travelReplySent=true;ws.send(reply);const dir=path.join(path.dirname(captureDir),'responses');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,id+'-travel.bin'),reply);fs.writeFileSync(path.join(dir,id+'-travel.json'),JSON.stringify({mode:'experimental-mycourt-travel',bytes:reply.length,packetId:'0x9FFCDAD0'},null,2));}}
    catch(e){fs.writeFileSync(path.join(captureDir,id+'-travel-error.json'),JSON.stringify({event:'travel-reply-error',reason:e.message}));}
   }
   if(isBinary&&decoded&&!entryReplySent&&options.replyBuilder){
    try{
     const reply=options.replyBuilder(bytes);
     if(reply){entryReplySent=true;if(gameplay)gameplay.bind(bytes,reply);ws.send(reply);if(park)try{park.bindEntry(bytes,reply);}catch(e){parkLogger(lab)({event:'park-bind-error',reason:e.message});}const responseDir=path.join(path.dirname(captureDir),'responses');fs.mkdirSync(responseDir,{recursive:true});fs.writeFileSync(path.join(responseDir,id+'-ws.bin'),reply);fs.writeFileSync(path.join(responseDir,id+'-ws.json'),JSON.stringify({mode:options.replyMode||'experimental-world-entry-route-probe',bytes:reply.length,packetId:'0x9D32C5B4'},null,2));}
     if(reply&&options.mycourtBootstrap){const room=require('./mycourt-bootstrap.cjs').buildMyCourtBootstrap(bytes,reply);if(room){ws.send(room);const dir=path.join(path.dirname(captureDir),'responses');fs.writeFileSync(path.join(dir,id+'-mycourt.bin'),room);fs.writeFileSync(path.join(dir,id+'-mycourt.json'),JSON.stringify({mode:'experimental-mycourt-minimal-object',bytes:room.length,packetId:'0x9C72247C',classCrc:'0x16A0D01E',fields:[0,1,2],customizationsImplemented:false},null,2));}}
    }catch(e){fs.writeFileSync(path.join(captureDir,id+'-reply-error.json'),JSON.stringify({event:'entry-reply-error',reason:e.message},null,2));}
   }
   if(isBinary&&decoded&&park){try{const result=park.handle(bytes);if(result)parkLogger(lab)({capture:id,...result});}catch(e){parkLogger(lab)({capture:id,event:'park-error',reason:e.message});}}
   if(isBinary&&decoded&&gameplay){try{const result=gameplay.handle(bytes);if(result){const {frames,...metadata}=result;metadata.responses=(frames||[]).map(frame=>({bytes:frame.length,packetId:'0x9C72247C',classCrc:'0x'+frame.readUInt32BE(24).toString(16)}));const dir=path.join(path.dirname(captureDir),'responses');fs.mkdirSync(dir,{recursive:true});for(const [index,frame] of (frames||[]).entries()){ws.send(frame);fs.writeFileSync(path.join(dir,id+'-gameplay-'+index+'.bin'),frame);}fs.writeFileSync(path.join(dir,id+'-gameplay.json'),JSON.stringify(metadata,null,2));}}catch(e){fs.writeFileSync(path.join(captureDir,id+'-gameplay-error.json'),JSON.stringify({event:'mycourt-gameplay-error',reason:e.message}));}}
  });
 });
 server.on('close',()=>{for(const client of wss.clients)client.terminate();wss.close();});
 return wss;
}
function parkLogger(lab){
 return entry=>{const line=JSON.stringify({at:new Date().toISOString(),...entry},(k,v)=>typeof v==='bigint'?v.toString():v);
  try{fs.appendFileSync(path.join(lab,'park-events.log'),line+'\n');}catch{}
  if(entry&&entry.event&&!/^relay-data/.test(entry.event))console.log('[park]',line);};
}
module.exports={decodeEnvelope,attachParkCapture,parkLogger};
