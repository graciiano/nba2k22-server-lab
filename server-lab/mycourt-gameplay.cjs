'use strict';
const codec=require(require('./reference-codecs.cjs').opalPath());
const U32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const U64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;};
function objectFrame(key,version,kind,bits,fields,connection){
 const head=Buffer.alloc(16),bitmap=Buffer.alloc(Math.ceil(bits/8));head.writeBigUInt64BE(key);head.writeBigUInt64BE(version,8);
 const indexes=[...fields.keys()].sort((a,b)=>a-b);for(const i of indexes){if(i<0||i>=bits)throw Error('Object field outside schema');bitmap[i>>3]|=128>>(i&7);}
 return wrap(key,kind,Buffer.concat([head,bitmap,...indexes.map(i=>fields.get(i))]),connection);
}
function wrap(key,kind,payload,connection){const out=Buffer.alloc(32+payload.length);out.writeUInt32LE(out.length);out.writeUInt32BE(0x9c72247c,4);connection.copy(out,8);out.writeBigUInt64BE(key,16);out.writeUInt32BE(kind,24);out.writeUInt32BE(payload.length,28);payload.copy(out,32);return out;}
// 2K22: PLAYER flags reader 141651910: 165 bits (131 calls + arrays 5/31).
// Values reader 14164BD80: four U64s, State U32, CourtName U32.
// COURT 141650420 inherits 20 bits from 1416513E0, adds 128: 148 total.
// 141648030: derived CourtType=0, AwayCount=8, HomeCount=35, HomeIds=36.
function createMyCourtGameplay(){
 let player=null,room=null,body=null,connection=null,version=1n,playing=false,allowedPlayers=[],machine=null,roomConfirmed=false;
 function bind(request,reply){const r=codec.Parse(request,16);if(codec.Find(r,0x5cedb580)?.Data1!==0xc1e9be6a)return;
  const list=codec.Parse(reply,16),match=codec.Find(list,0xd4c0767a)?.Value;
  allowedPlayers=[codec.Find(list,0x3a60fe52)?.Value,codec.Find(list,0x693578b9)?.Value].filter(x=>typeof x==='bigint'&&x!==0n);player=allowedPlayers[0];
  machine=codec.Find(list,0xc56500f9)?.Value;
  if(!match||!player)throw Error('MyCourt gameplay identity missing');room=((match&0xffffffffn)<<32n)|0xd4d06n;connection=Buffer.from(reply.subarray(8,16));
 }
 function handle(bytes){
  if(!room||bytes.length<32)return null;const packet=bytes.readUInt32BE(4);
  if(packet===0x366444c1&&bytes.length>=90&&bytes.readUInt32BE(32)===0x2c5d2702&&allowedPlayers.includes(bytes.readBigUInt64BE(24))){
   const candidatePlayer=bytes.readBigUInt64BE(24);
   const list=codec.Parse(bytes,42),f=codec.Find(list,0x9b661ed7);if(!f||f.Type!==codec.Type.BlobRef||list.DataOffset+f.Data1+f.Data2>bytes.length)throw Error('Player handshake blob bounds');
   const candidate=bytes.subarray(list.DataOffset+f.Data1,list.DataOffset+f.Data1+f.Data2);
   if(candidate.length<77||candidate.readBigUInt64BE(0)!==candidatePlayer||(candidate[16]&0xfc)!==0xfc||candidate.readBigUInt64LE(37)!==candidatePlayer||candidate.readUInt32LE(69)!==0x9705bb0d)throw Error('Player handshake differs from validated 2K22 schema');
   player=candidatePlayer;body=Buffer.from(candidate);version=body.readBigUInt64BE(8)+1n;body.writeBigUInt64BE(version,8);
   if(machine)body.writeBigUInt64LE(machine,45);
   return {event:'mycourt-player-schema-accepted',bodyBytes:body.length,bitmapBytes:21,frames:[wrap(player,0x2c5d2702,body,connection)]};
  }
  if(packet===0xfef2dd68&&bytes.length>=62&&bytes.readUInt32BE(32)===0x16a0d01e&&bytes.readBigUInt64BE(24)===room&&!roomConfirmed){
   if(bytes.readUInt16BE(40)!==bytes.length-42)throw Error('MyCourt native update bounds');
   const payload=bytes.subarray(42);if(payload.readBigUInt64BE(0)!==room)throw Error('MyCourt native update object mismatch');
   // Native owner GenerateRoom update: IsValid, two native blobs, count and five buffers.
   const indexes=[];for(let i=0;i<30;i++)if(payload[16+(i>>3)]&(128>>(i&7)))indexes.push(i);
   if(!indexes.includes(3))return null;
   if(indexes.some(i=>![3,12,13,14,20,21,22,23,24].includes(i)))throw Error('MyCourt owner update differs from captured schema');
   let at=20,valid=false;
   for(const i of indexes){if(i===3){valid=payload[at++]===1;}else if(i===14){at+=8;}else{
    if(at+4>payload.length)throw Error('MyCourt native blob header bounds');const length=payload.readUInt32LE(at);at+=4;
    if((i===12&&length!==4860)||(i===13&&length!==2784)||at+length>payload.length)throw Error('MyCourt native blob size differs');at+=length;
   }}
   if(!valid||at!==payload.length)throw Error('MyCourt owner update is incomplete');
   const confirmed=Buffer.from(payload),nativeVersion=payload.readBigUInt64BE(8);version=(version>nativeVersion?version:nativeVersion)+1n;confirmed.writeBigUInt64BE(version,8);roomConfirmed=true;
   return {event:'experimental-mycourt-owner-room-confirmed',nativeCustomization:true,frames:[wrap(room,0x16a0d01e,confirmed,connection)]};
  }
  if(packet!==0xce148fb1||bytes.length<52)return null;
  const list=codec.Parse(bytes,36),command=codec.Find(list,0xb18f14ce)?.Data1;
  if(![0xab153d7e,0xdaeafe9e].includes(command))return null;
  const ending=command===0xdaeafe9e,court=(room&0xffffffff00000000n)|0xd4d10n,target=bytes.readBigUInt64BE(24);
  if(target!==room&&!(ending&&target===court))return {event:'mycourt-gameplay-rejected-target'};
  if(!body)return {event:'mycourt-gameplay-awaiting-player-handshake'};
  const slot=codec.Find(list,0xba4bba9d)?.Value,count=codec.Find(list,0xa8357302)?.Value;
  const players=list.Fields.filter(f=>f.Crc===0x190bbdbc).map(f=>f.Value);
  if(!ending&&(count!==1n||players.length!==1||players[0]!==player||slot!==0n))return {event:'mycourt-gameplay-unsupported-mode',playerCount:count===undefined?null:Number(count),slot:slot===undefined?null:Number(slot)};
  if(playing===!ending)return {event:'mycourt-gameplay-duplicate'};
  version++;const frames=[];
  if(!ending)frames.push(objectFrame(court,version,0x2c4d49e3,148,new Map([
   [0,U32(0xd4d10)],[1,Buffer.from([1])],
   // Native GAMEOBJECT base: ObjectState+144 = field9, RandomSeed+170
   // = field16, MatchId+180 = field17. The old seed alone is not a match.
   // 1416AF4A9 explicitly tests ObjectState==3 while building game data.
   [9,U32(3)],[10,Buffer.from([0])],[11,Buffer.from([0])],[16,U64(court)],[17,U64(court)],
   // Native 1416A13F0 accepts types31/32; UpdateCrib 140457A64 consumes
   // it in the couch branch. Type33 is a candidate handled explicitly at
   // 1417286E5. Its solo gameplay semantics still need runtime validation.
   [20,U32(33)],[28,Buffer.from([0])],[29,U32(0)],[55,Buffer.from([1])],[56,U64(player)],
   // Native Court field81 -> byte+309, reader 141648AA2.
   // Other activity actors read it; this alone does not prove MyCourt readiness.
   [81,Buffer.from([1])],
   // Native 1416A9056 reads HomeSpotCount+679 and AwaySpotCount+67B
   // for CourtType15..30 in the replay path; these are not gameplay seats.
   [98,Buffer.from([1])],[99,Buffer.from([0])],[100,Buffer.from([0])]
  ]),connection));
  // Sparse room delta retains native owner customizations and player data.
  const roomFrame=objectFrame(room,version,0x16a0d01e,30,new Map([[2,U32(ending?0x4905ed7b:0x9712981b)],[4,U32(0)],[5,Buffer.from([ending?0:1])],[6,U64(ending?0n:player)]]),connection);
  const updated=Buffer.from(body);updated.writeBigUInt64BE(version,8);updated.writeUInt32LE(ending?0x9705bb0d:0xecbccdf8,69);updated.writeUInt32LE(ending?0:0xd4d10,73);
  // UpdateCrib 140457921 tests the local Player before looking at the
  // room. Publishing SCRIMMAGE first can enter CRIB4 while still WALKING.
  frames.push(wrap(player,0x2c5d2702,updated,connection));frames.push(roomFrame);playing=!ending;
  return {event:ending?'experimental-mycourt-shootaround-ended':'experimental-mycourt-shootaround-start',frames,playerCount:1,courtType:33};
 }
 return {bind,handle};
}
module.exports={createMyCourtGameplay,objectFrame};



