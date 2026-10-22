'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
// World WebSocket transport (upgrade on /Park/probe) plus a small loopback-only
// control panel for the Park courts: http://127.0.0.1:21023/park
function createWorldCaptureTransport(captureDir,options={}){
 fs.mkdirSync(captureDir,{recursive:true});
 const lab=path.dirname(captureDir);
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith('/park')){res.writeHead(404);res.end('World socket only');return;}
  const remote=req.socket.remoteAddress||'';
  if(!/^(::ffff:)?127\.0\.0\.1$|^::1$/.test(remote)){res.writeHead(403);res.end('Painel apenas local');return;}
  if(!fs.existsSync(path.join(lab,'park-courts.enabled'))){res.writeHead(409);res.end('Ative criando server-lab/park-courts.enabled');return;}
  const hub=require('./park-courts.cjs').sharedHub(lab,require('./park-capture.cjs').parkLogger(lab));
  const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value,(k,v)=>typeof v==='bigint'?v.toString():v,2));};
  try{
   if(req.method==='GET'&&(url.pathname==='/park'||url.pathname==='/park/')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'park-panel.html')));return;}
   if(req.method==='GET'&&url.pathname==='/park/status'){json(200,hub.status());return;}
   if(req.method!=='POST'){json(405,{error:'Use POST'});return;}
   const q=Object.fromEntries(url.searchParams);
   if(url.pathname==='/park/mark'){json(200,hub.mark(q));return;}
   if(url.pathname==='/park/inset'){json(200,hub.setInset(q.court,q.inset,{along:q.along,spacing:q.spacing,sameSide:q.sameSide,teamSize:q.teamSize}));return;}
   if(url.pathname==='/park/remove'){json(200,{courts:hub.removeCourt(q.court)});return;}
   if(url.pathname==='/park/reload'){const n=hub.reload();for(const p of hub.parkPeers())if(p.body)hub.publishCourts(p);json(200,{courts:n});return;}
   if(url.pathname==='/park/end'){const c=[...hub.courts.values()].find(c=>c.def.name===q.court);if(c)hub.endGame(c,'panel');json(200,{ended:!!c});return;}
   json(404,{error:'Rota desconhecida'});
  }catch(e){json(400,{error:e.message});}
 });
 require('./park-capture.cjs').attachParkCapture(server,captureDir,options);
 return server;
}
module.exports={createWorldCaptureTransport};
