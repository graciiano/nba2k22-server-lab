'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const codec=require(require('./reference-codecs.cjs').opalPath());
const {validateCaptureUrl}=require('./world-connect.cjs');
function buildEntryReply(bytes,routeUrl,authorizePuid,bootstrap){
 if(bytes.length<32||bytes.length>1024*1024||bytes.readUInt32LE(0)!==bytes.length)throw new Error('Invalid entry envelope');
 if(bytes.readUInt32BE(4)!==0x9d32c5b4)return null;
 const list=codec.Parse(bytes,16);
 if(list.Fields.length>4096||list.DataOffset>bytes.length)throw new Error('Invalid entry field list');
 const field=codec.Find(list,0x693578b9);
 if(!field||field.Type!==codec.Type.U64||!field.Value||!authorizePuid(field.Value))throw new Error('Entry identity not bound to laboratory session');
 const route=validateCaptureUrl(routeUrl);
 // Deliberate diagnostic branch: the native parser accepts URL + endpoint.
 // This does not allocate a match or manufacture a roster / player data.
 const builder=new codec.Builder().AddU32(0xe3920695,0x504521a8)
  .AddPacked(0x6cd5d4f9,0x7f000001,(route.port<<16)>>>0).AddU64(0x693578b9,field.Value);
 if(bootstrap){
  const account=codec.Find(list,0x3a60fe52);
  if(!account||account.Type!==codec.Type.U64||account.Value!==BigInt(bootstrap.userId))throw new Error('Entry account/session mismatch');
  builder.AddU64(0xd4c0767a,bootstrap.matchId).AddU64(0x1780ec1f,1n)
   .AddU64(0xc56500f9,field.Value).AddU32(0x2a6acaad,0x1a236ec5).AddU32(0x87e5bc62,0x1a236ec5)
   .AddBlob(0xae6eea84,bootstrap.relayToken).AddU64(0xa2026379,1n).AddBlob(0x247fa77f,Buffer.alloc(0))
   .AddU64(0x92cd7d5b,field.Value).AddU64(0x8c9ef2cf,1n).AddU64(0x3a60fe52,account.Value)
   .AddBlob(0x3fa02989,new codec.Builder().AddU64(0x6875d146,0n).Build())
   .AddBlob(0x9ad3e8f7,Buffer.alloc(0)).AddU64(0x61e5e2ac,0n);
 }else builder.AddString(0x62d10724,route.url);
 const body=builder.Build();
 const reply=Buffer.alloc(16+body.length);reply.writeUInt32LE(reply.length);reply.writeUInt32BE(0x9d32c5b4,4);
 bytes.copy(reply,8,8,16);body.copy(reply,16);return reply;
}
function createEntryResponder(lab){
 const matchId=crypto.randomBytes(8).readBigUInt64BE()||1n,relayToken=crypto.randomBytes(16);
 const responder=bytes=>{
  const config=JSON.parse(fs.readFileSync(path.join(lab,'world-entry.json'),'utf8'));
  if(!['route-probe','single-player-bootstrap'].includes(config.mode))return null;
  const route=JSON.parse(fs.readFileSync(path.join(lab,'world-route.json'),'utf8')).url;
  const saved=JSON.parse(fs.readFileSync(path.join(lab,'sessions.json'),'utf8'));
  const sessions=Array.isArray(saved)?saved.map(row=>Array.isArray(row)?row[1]:row):Object.values(saved);
  let bound;
  const authorize=puid=>{bound=sessions.find(s=>s&&s.userId&&s.worldPuid&&BigInt(s.worldPuid)===puid);return !!bound;};
  if(config.mode==='route-probe')return buildEntryReply(bytes,route,authorize);
  if(bytes.length<32||bytes.readUInt32BE(4)!==0x9d32c5b4)return null;
  const puid=codec.Find(codec.Parse(bytes,16),0x693578b9)?.Value;
  if(!puid||!authorize(puid))throw new Error('Entry identity not bound to laboratory session');
  return buildEntryReply(bytes,route,authorize,{userId:bound.userId,matchId,relayToken});
 };
 responder.matchId=matchId;return responder;
}
module.exports={buildEntryReply,createEntryResponder};
