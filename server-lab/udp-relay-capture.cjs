'use strict';
const dgram=require('node:dgram'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function startRelayCapture(port,captureDir){
 const socket=dgram.createSocket('udp4');
 socket.on('message',(bytes,peer)=>{
  if(peer.address!=='127.0.0.1')return;
  const id=Date.now()+'-udp-'+crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(path.join(captureDir,id+'.bin'),bytes);
  fs.writeFileSync(path.join(captureDir,id+'.json'),JSON.stringify({event:'udp-relay-capture',bytes:bytes.length,localPort:port,peerIsLoopback:true,replyImplemented:false},null,2));
 });
 socket.on('error',error=>{fs.writeFileSync(path.join(captureDir,Date.now()+'-udp-error.json'),JSON.stringify({event:'udp-relay-error',code:error.code||'unknown'}));});
 socket.bind(port,'127.0.0.1');return socket;
}
module.exports={startRelayCapture};
