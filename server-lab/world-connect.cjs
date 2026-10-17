'use strict';
const {Builder}=require(process.env.REFERENCE_CODEC || require('./reference-codecs.cjs').granitePath());
// Experimental route carrier. This directs the next protocol stage to a capture
// socket; it does not implement match allocation, travel or Park gameplay.
const defaultCaptureUrl='wss://127.0.0.1:21022/Park/probe';
function validateCaptureUrl(value){
 const url=new URL(value);
 if(!['ws:','wss:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash||url.pathname!=='/Park/probe')throw new Error('World capture URL must target the loopback probe');
 const port=Number(url.port|| (url.protocol==='wss:'?443:80));if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid world capture port');
 return {url:url.href,port,secure:url.protocol==='wss:'};
}
function buildWorldConnect(playerPuid,captureUrl=defaultCaptureUrl){
 const puid=BigInt(playerPuid);if(puid<=0n)throw new Error('World player identity unresolved');
 const route=validateCaptureUrl(captureUrl);
 return new Builder().AddU32(0xe3920695,0x504521a8)
  .AddString8(0x62d10724,route.url)
  .AddPacked(0x6cd5d4f9,0x7f000001,(route.port<<16)>>>0)
  .AddU64(0x693578b9,puid);
}
module.exports={buildWorldConnect,validateCaptureUrl,defaultCaptureUrl};
