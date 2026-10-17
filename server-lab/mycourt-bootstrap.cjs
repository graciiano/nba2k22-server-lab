'use strict';
const codec=require(require('./reference-codecs.cjs').opalPath());
// Experimental minimal object. 2K22 native class/type and first three member
// sizes verified at 1415F6CF0/14162E7C0. Remaining customizations are omitted.
function buildMyCourtBootstrap(request,entryReply){
 if(request.length<32||request.readUInt32BE(4)!==0x9d32c5b4)return null;
 const list=codec.Parse(request,16);
 if(codec.Find(list,0x5cedb580)?.Data1!==0xc1e9be6a)return null;
 const reply=codec.Parse(entryReply,16),match=codec.Find(reply,0xd4c0767a)?.Value,owner=codec.Find(reply,0x3a60fe52)?.Value;
 // 141678230 returns room+98; 141678290 compares it to login USERID.
 // A matching account selects owner role 2 and native GenerateRoom.
 if(!match||!owner)throw Error('MyCourt bootstrap identity missing');
 const key=((match&0xffffffffn)<<32n)|0xd4d06n;
 const payload=Buffer.alloc(36);payload.writeBigUInt64BE(key,0);payload.writeBigUInt64BE(1n,8);
 // 30 dirty fields in 2K22, four flag bytes; only bits 0..2 are supplied.
 payload[16]=0xe0;payload.writeUInt32LE(0x9705bb0d,20);payload.writeBigUInt64LE(owner,24);payload.writeUInt32LE(0x4905ed7b,32);
 const frame=Buffer.alloc(32+payload.length);frame.writeUInt32LE(frame.length);frame.writeUInt32BE(0x9c72247c,4);
 entryReply.copy(frame,8,8,16);frame.writeBigUInt64BE(key,16);frame.writeUInt32BE(0x16a0d01e,24);frame.writeUInt32BE(payload.length,28);payload.copy(frame,32);
 return frame;
}
module.exports={buildMyCourtBootstrap};
