'use strict';
const crypto=require('node:crypto');
const originalKey=Symbol('native websocket key');
function isNativeKey(key){
 // Observed NBA2K22 wire key: 31 printable ASCII characters. Its contents
 // are opaque; handshake acceptance hashes the exact received string.
 if(typeof key==='string'&&/^[\x21-\x7e]{31}$/.test(key))return true;
 if(typeof key!=='string'||! /^[A-Za-z0-9+/_-]{342}(==)?$/.test(key))return false;
 const canonical=key.replace(/-/g,'+').replace(/_/g,'/').replace(/=+$/,'');
 const bytes=Buffer.from(canonical,'base64');
 return bytes.length===256&&bytes.toString('base64').replace(/=+$/,'')===canonical;
}
function prepareNativeKey(req){
 const key=req.headers['sec-websocket-key'];
 if(!isNativeKey(key))return false;
 req[originalKey]=key;
 // Let ws validate every other handshake field and retain its frame handling.
 req.headers['sec-websocket-key']=Buffer.alloc(16).toString('base64');
 return true;
}
function restoreNativeAccept(headers,req){
 if(!req[originalKey])return;
 const accept=crypto.createHash('sha1').update(req[originalKey]+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
 const index=headers.findIndex(h=>/^Sec-WebSocket-Accept:/i.test(h));
 if(index<0)throw new Error('Missing websocket acceptance header');
 headers[index]='Sec-WebSocket-Accept: '+accept;
 req.headers['sec-websocket-key']=req[originalKey];
 delete req[originalKey];
}
module.exports={isNativeKey,prepareNativeKey,restoreNativeAccept};
