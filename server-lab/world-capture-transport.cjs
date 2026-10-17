'use strict';
const http=require('node:http'),fs=require('node:fs');
function createWorldCaptureTransport(captureDir,options={}){
 fs.mkdirSync(captureDir,{recursive:true});
 const server=http.createServer((req,res)=>{res.writeHead(404);res.end('World socket capture only');});
 require('./park-capture.cjs').attachParkCapture(server,captureDir,options);
 return server;
}
module.exports={createWorldCaptureTransport};
