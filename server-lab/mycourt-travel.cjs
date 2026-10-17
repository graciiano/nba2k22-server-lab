'use strict';
const fs=require('node:fs'),path=require('node:path');
const codec=require(require('./reference-codecs.cjs').opalPath());
function buildTravel(bytes,sessionId,authorize){
 if(bytes.length<52||bytes.readUInt32LE(0)!==bytes.length||bytes.readUInt32BE(4)!==0xce148fb1)return null;
 const at=codec.Locate(bytes,16,96);if(at<0)return null;
 const list=codec.Parse(bytes,at),u32=crc=>codec.Find(list,crc)?.Data1;
 if(u32(0xb18f14ce)!==0x5bb78c48||u32(0x68b693b2)!==0xc1e9be6a||u32(0x98ad1587)!==0x7eb406e1)return null;
 const puid=codec.Find(list,0xd0344d20)?.Value||codec.Find(list,0x693578b9)?.Value;
 if(!puid||!authorize(puid))throw Error('MyCourt owner not bound to laboratory session');
 // Native 141683150: URL+B4, ticket length+B2, type+1C, location+48.
 // 2K19's URL+E2 is incompatible. This is a travel probe, not a room object.
 const url=Buffer.from('ws://127.0.0.1:21023/Park/probe\0');
 const ticket=new codec.Builder().AddU32(0x05385d34,0xbbe63b84).AddU64(0x1780ec1f,1n)
  .AddU32(0x5cedb580,0xc1e9be6a).AddU32(0x7d3e7efa,0xc1e9be6a)
  .AddU32(0x98ad1587,0x7eb406e1).AddU64(0xd4c0767a,sessionId).Build();
 const body=Buffer.alloc(0xb4+1024);body.writeUInt32BE(0x86073f8c,0);body.writeBigUInt64BE(sessionId,4);
 body.writeUInt32BE(0xc1e9be6a,0x1c);body.writeUInt32BE(0xfeac4070,0x24);body.writeUInt32BE(0x7eb406e1,0x48);
 body.writeUInt16BE(ticket.length,0xb2);url.copy(body,0xb4);ticket.copy(body,0xb4+url.length);
 const reply=Buffer.alloc(16+body.length);reply.writeUInt32LE(reply.length);reply.writeUInt32BE(0x9ffcdad0,4);bytes.copy(reply,8,8,16);body.copy(reply,16);return reply;
}
function createMyCourtTravel(lab,sessionId){return bytes=>{
 const sessions=JSON.parse(fs.readFileSync(path.join(lab,'sessions.json'),'utf8')).map(row=>row[1]);
 // Observed uppercase PUID is the account owner; lowercase puid is zero here.
 return buildTravel(bytes,sessionId,puid=>sessions.some(s=>s.worldPuid&&s.userId&&s.userId!=='0'&&BigInt(s.userId)===puid));
};}
module.exports={buildTravel,createMyCourtTravel};
