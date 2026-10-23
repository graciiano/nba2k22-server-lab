'use strict';
// Laboratory transport. The codec is loaded from the read-only local 2K19 reference.
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const codecPath = process.env.REFERENCE_CODEC || require('./reference-codecs.cjs').granitePath();
const {Builder, TryParse, DateToVCDate, GetU64, GetU32, GetString8} = require(codecPath);
const ID = {result:0xe3920695, success:0x504521a8, denied:0xc2141f44, key:0xda780e45, services:0xb5017d25, serverTime:0xe9824107, issuedAt:0x329a965f, environment:0x517c7ed8, sku:0xcff900a4, manifestTimestamp:0x93f13b2d};
function createLab(options={}) {
  const worldConfig=path.join(__dirname,'world-route.json');
  const worldCaptureUrl=options.worldCaptureUrl||(!options.captureDir&&fs.existsSync(worldConfig)?JSON.parse(fs.readFileSync(worldConfig,'utf8')).url:require('./world-connect.cjs').defaultCaptureUrl);
  require('./world-connect.cjs').validateCaptureUrl(worldCaptureUrl);
  const clockFile=path.join(__dirname,'clock.json');
  const clockConfig=options.clock || (!options.captureDir && fs.existsSync(clockFile)?JSON.parse(fs.readFileSync(clockFile,'utf8')):{});
  const laboratoryNow=require('./laboratory-clock.cjs').createLaboratoryClock(clockConfig);
  const sessionFile=options.sessionFile || path.join(options.captureDir || __dirname,'sessions.json');
  let restored=[];if(fs.existsSync(sessionFile)){try{restored=JSON.parse(fs.readFileSync(sessionFile,'utf8'));}catch{throw new Error('Laboratory session store is invalid');}}
  const sessions=new Map(restored);
  if(!options.captureDir && !fs.existsSync(sessionFile)) {
    const responseDir=path.join(__dirname,'responses');
    if(fs.existsSync(responseDir))for(const file of fs.readdirSync(responseDir).filter(x=>x.endsWith('.bin'))){
      const r=TryParse(fs.readFileSync(path.join(responseDir,file)));if(!r.Ok)continue;
      const key=GetU64(r.Parsed.Fields,ID.key);if(key)sessions.set(key.toString(),{createdAt:fs.statSync(path.join(responseDir,file)).mtimeMs});
    }
  }
  if(!options.captureDir){
 const responseDir=path.join(__dirname,'responses');
 if(fs.existsSync(responseDir))for(const file of fs.readdirSync(responseDir).filter(x=>x.endsWith('.bin'))){
  const requestFile=path.join(__dirname,'captures',file);if(!fs.existsSync(requestFile))continue;
  const response=TryParse(fs.readFileSync(path.join(responseDir,file)));const request=TryParse(fs.readFileSync(requestFile));if(!response.Ok||!request.Ok)continue;
  const key=GetU64(response.Parsed.Fields,ID.key);const user=GetU64(request.Parsed.Fields,0x01caaee8);
  const session=key&&sessions.get(key.toString());if(session&&user&&(!session.userId||session.userId==='0')){session.userId=user.toString();session.gamertag=GetString8(request.Parsed.Fields,0x3e6d9a3b)||'';}
 }
}
  const saveSessions=()=>{fs.mkdirSync(path.dirname(sessionFile),{recursive:true});fs.writeFileSync(sessionFile+'.tmp',JSON.stringify([...sessions]));fs.renameSync(sessionFile+'.tmp',sessionFile);};
  const captures = options.captureDir || path.join(__dirname,'captures');
  const itemInventory=require('./item-inventory.cjs').createItemInventory(path.dirname(sessionFile));
  fs.mkdirSync(captures,{recursive:true});
  const experiment = options.experimentalLogin === true;
  const handler = async (req,res) => {
    const requestUrl=new URL(req.url,'https://localhost');const route=requestUrl.pathname;
    if(req.method==='GET' && route==='/health') {
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({status:'laboratory',experimentalLogin:experiment,parkCourts:fs.existsSync(path.join(__dirname,'park-courts.enabled')),sessions:sessions.size})); return;
    }
    const chunks=[]; let size=0;
    try { for await(const chunk of req) {size+=chunk.length;if(size>1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);} }
    catch {res.writeHead(400);res.end();return;}
    const body=Buffer.concat(chunks);
    const declared=req.headers.vcfieldlist_size;
    const parsed=TryParse(body,{FieldListSize:declared ? Number(declared) : 0,MaximumFields:4096});
    const captureId=Date.now()+'-'+crypto.randomBytes(4).toString('hex');
    // Local wire captures may contain account/session data; summaries omit field values.
    fs.writeFileSync(path.join(captures,captureId+'.bin'),body);
    fs.writeFileSync(path.join(captures,captureId+'.json'),JSON.stringify({method:req.method,url:route,queryNames:[...requestUrl.searchParams.keys()],headerNames:Object.keys(req.headers),bytes:size,parseOk:parsed.Ok,error:parsed.Ok?undefined:String(parsed.Error.message),fields:parsed.Ok?parsed.Parsed.Fields.map(f=>({crc:f.CrcHex,type:f.TypeHex})):[]},null,2));
    if(!parsed.Ok){res.writeHead(400);res.end('Unrecognized field-list body');return;}
    if(req.method!=='POST' || !['/Session/login','/Session/update','/Accounts/get','/World/connect','/MyCareer/Attributes/get','/MyCareer/Attributes/price','/VirtualCurrency/balance','/VirtualCurrency/purchase','/VirtualCurrency/get_prices','/VirtualCurrency/items/purchase','/StoreV4/get_owned_items','/Text/validate'].includes(route)){res.writeHead(501);res.end('Service not implemented');return;}
    if(!experiment){res.writeHead(501);res.end('Capture mode: login replies disabled');return;}
    const fields=parsed.Parsed.Fields;
    let key;
    if(route==='/Session/login') {
      key=crypto.randomBytes(8).readBigUInt64BE() || 1n;
      sessions.set(key.toString(),{createdAt:Date.now(),environment:GetU32(fields,ID.environment),sku:GetU32(fields,ID.sku),userId:(GetU64(fields,0x01caaee8)||0n).toString(),gamertag:GetString8(fields,0x3e6d9a3b)||''});saveSessions();
    } else {key=GetU64(fields,ID.key);const queryKey=requestUrl.searchParams.get('x');if(!key && queryKey && /^\d{1,20}$/.test(queryKey))key=BigInt(queryKey);if(!key || !sessions.has(key.toString())){res.writeHead(401);res.end('Unknown laboratory session');return;}}
    const now=DateToVCDate(laboratoryNow());
    let reply=new Builder().AddU32(ID.result,ID.success).AddU64(ID.key,key).AddVCDate(ID.serverTime,now).AddVCDate(ID.issuedAt,now);
    const environment=GetU32(fields,ID.environment);if(environment!==null)reply.AddU32(ID.environment,environment);
    const sku=GetU32(fields,ID.sku);if(sku!==null)reply.AddU32(ID.sku,sku);
    reply.AddU64(ID.manifestTimestamp,0n);
    // Advertise only services observed in this client's request lookup.
    reply.AddBinary(ID.services,require('./session-services.cjs').buildServices());
    if(route==='/Accounts/get'){
 const session=sessions.get(key.toString());const user=session.userId?BigInt(session.userId):0n;
 if(!user){res.writeHead(409);res.end('Laboratory account identity unresolved');return;}
 const requestedUser=GetU64(fields,0x01caaee8);if(requestedUser&&requestedUser!==user){res.writeHead(403);res.end('Account/session mismatch');return;}
 reply=new Builder().AddU32(ID.result,ID.success).AddU64(0x01caaee8,user).AddString8(0x8cb84fe9,session.gamertag||'').AddString8(0xb28711b9,session.gamertag||'');
 }
 if(route==='/World/connect'){
  const session=sessions.get(key.toString());const user=session.userId?BigInt(session.userId):0n;
  if(!user){res.writeHead(409);res.end('Laboratory world identity unresolved');return;}
  const puid=GetU64(fields,0x693578b9);if(!puid){res.writeHead(400);res.end('World player identity missing');return;}
  if(session.worldPuid&&BigInt(session.worldPuid)!==puid){res.writeHead(403);res.end('World player/session mismatch');return;}
  const collision=[...sessions.values()].some(other=>other.userId!==session.userId&&other.worldPuid&&BigInt(other.worldPuid)===puid);
  if(collision){res.writeHead(403);res.end('World player identity already bound');return;}
  if(!session.worldPuid){session.worldPuid=puid.toString();saveSessions();}
  reply=require('./world-connect.cjs').buildWorldConnect(puid,worldCaptureUrl);
 }
 if(route==='/MyCareer/Attributes/price'){
  try{const file=path.join(__dirname,'progression-policy.json');const policy=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};reply=require('./attribute-prices.cjs').buildAttributePrices(fields,{base:policy.attributePriceBase??0,step:policy.attributePriceStep??0});}catch{res.writeHead(400);res.end('Invalid attribute price request');return;}
 }
 if(route==='/VirtualCurrency/get_prices'){
  try{reply=require('./item-prices.cjs').buildItemPrices(fields);}catch{res.writeHead(400);res.end('Invalid item price request');return;}
  // progression-policy.json "ownAllShopItems": itens exibidos na loja passam a ser da conta (roupas,
  // animações etc. liberadas sem compra). Registra também o catálogo visto em shop-catalog.json.
  try{
   const policyFile=path.join(__dirname,'progression-policy.json'),policy=fs.existsSync(policyFile)?JSON.parse(fs.readFileSync(policyFile,'utf8')):{};
   const ids=require('./item-prices.cjs').readPriceItems(fields);
   const catFile=path.join(__dirname,'shop-catalog.json'),cat=fs.existsSync(catFile)?JSON.parse(fs.readFileSync(catFile,'utf8')):[];
   const merged=[...new Set([...cat,...ids])];if(merged.length!==cat.length){fs.writeFileSync(catFile+'.tmp',JSON.stringify(merged));fs.renameSync(catFile+'.tmp',catFile);}
   const user=sessions.get(key.toString())?.userId;
   if(policy.ownAllShopItems&&user&&user!=='0')itemInventory.grant(user,ids);
  }catch(e){console.error('shop grant failed:',e.message);}
 }
 if(route==='/Text/validate'){
  try{reply=require('./name-validation.cjs').buildNameValidation(fields,parsed.Parsed.Data);}catch{res.writeHead(400);res.end('Invalid name validation request');return;}
 }
 if(route==='/VirtualCurrency/items/purchase'||route==='/StoreV4/get_owned_items'){
  const user=sessions.get(key.toString()).userId;
  if(!user||user==='0'){res.writeHead(409);res.end('Laboratory account identity unresolved');return;}
  try{reply=route==='/VirtualCurrency/items/purchase'?itemInventory.purchase(user,fields):itemInventory.inventory(user,fields);}catch{res.writeHead(400);res.end('Unsupported item inventory request');return;}
 }
 if(route==='/MyCareer/Attributes/get'){
  // First-session experimental empty server record. Optional progression
  // fields are omitted; do not manufacture ratings, caps, unlocks or tuning.
  reply=new Builder().AddU32(ID.result,ID.success);
 }
 if(route==='/VirtualCurrency/balance'){
  const session=sessions.get(key.toString());
  if(!session.userId||session.userId==='0'){res.writeHead(409);res.end('Laboratory account identity unresolved');return;}
  // Private laboratory allowance; no payment or official account operation.
  reply=new Builder().AddU32(ID.result,ID.success).AddU64(0x93b1e1e4,2000000n);
 }
 if(route==='/VirtualCurrency/purchase'){
  const session=sessions.get(key.toString());
  if(!session.userId||session.userId==='0'){res.writeHead(409);res.end('Laboratory account identity unresolved');return;}
  let rows;try{rows=require('./attribute-purchase.cjs').readAttributePurchase(fields);}catch{res.writeHead(400);res.end('Unsupported laboratory purchase');return;}
  // Store an audit of the native cart proposal, not a fabricated build cap.
  const ledger=path.join(path.dirname(sessionFile),'attribute-purchases.jsonl');
  const entries=rows.map(row=>({build:crypto.createHash('sha256').update(session.userId+':'+row.save).digest('hex'),name:row.name,from:Number(row.from),to:Number(row.to)}));
  fs.appendFileSync(ledger,JSON.stringify({at:new Date().toISOString(),cost:0,entries})+'\n');
  reply=require('./attribute-purchase.cjs').buildAttributePurchase(rows);
 }
 const output=reply.Build();
    const responseDir=path.join(path.dirname(captures),'responses');fs.mkdirSync(responseDir,{recursive:true});
    fs.writeFileSync(path.join(responseDir,captureId+'.bin'),output.Body);
    fs.writeFileSync(path.join(responseDir,captureId+'.json'),JSON.stringify({request:captureId,status:200,mode:route==='/World/connect'?'experimental-world-route':route==='/Accounts/get'?'experimental-account':'experimental-login',bytes:output.Body.length,fieldListSize:output.FieldListSize,servicesCount:require('./session-services.cjs').services.length,fields:output.Fields.map(f=>({crc:'0x'+f.Crc.toString(16).toUpperCase(),type:'0x'+f.Type.toString(16).toUpperCase()}))},null,2));
    res.writeHead(200,{'Content-Type':'application/octet-stream','VCFIELDLIST_SIZE':String(output.FieldListSize),'Content-Length':output.Body.length,'Vc-Request-Id':String(req.headers['vc-request-id'] || '0'),'Connection':'close'});res.end(output.Body);
  };
  const server=options.tls ? https.createServer(options.tls,handler) : http.createServer(handler);
  server.on('tlsClientError',error=>{
    const id=Date.now()+'-tls-'+crypto.randomBytes(4).toString('hex');
    fs.writeFileSync(path.join(captures,id+'.json'),JSON.stringify({event:'tls-client-error',code:error.code||'unknown'},null,2));
  });
  require('./park-capture.cjs').attachParkCapture(server,captures);
  return server;
}
if(require.main===module) {
  const tlsFile=path.join(__dirname,'tls-local.json');
  const tlsConfig=fs.existsSync(tlsFile)?JSON.parse(fs.readFileSync(tlsFile,'utf8')):null;
  const tls=tlsConfig?{pfx:fs.readFileSync(path.join(__dirname,'localhost.pfx')),passphrase:tlsConfig.passphrase}:undefined;
  const server=createLab({tls,experimentalLogin:process.argv.includes('--experimental-login')});
  const port=Number(process.env.PORT || 21022);
  // LISTEN_HOST=0.0.0.0 lets friends reach this server through friend-proxy.cjs (VPN/LAN).
  const host=process.env.LISTEN_HOST||'127.0.0.1';
  server.listen(port,host,()=>console.log(`${tls?'https':'http'}://${host}:${port} — ${process.argv.includes('--experimental-login')?'experimental session replies':'capture mode'}`));
  const worldFile=path.join(__dirname,'world-route.json');
  const worldRoute=require('./world-connect.cjs').validateCaptureUrl(fs.existsSync(worldFile)?JSON.parse(fs.readFileSync(worldFile,'utf8')).url:require('./world-connect.cjs').defaultCaptureUrl);
  if(!worldRoute.secure){
    if(worldRoute.port===port)throw new Error('Plain world socket requires a separate port');
    const entryEnabled=fs.existsSync(path.join(__dirname,'world-entry.json'));
    const entryMode=entryEnabled?JSON.parse(fs.readFileSync(path.join(__dirname,'world-entry.json'),'utf8')).mode:null;
    const entryResponder=entryEnabled?require('./world-entry-probe.cjs').createEntryResponder(__dirname):null;
    const travelEnabled=fs.existsSync(path.join(__dirname,'mycourt-travel.enabled'));
    const worldServer=require('./world-capture-transport.cjs').createWorldCaptureTransport(path.join(__dirname,'captures'),entryEnabled?{replyBuilder:entryResponder,replyMode:'experimental-world-entry-'+entryMode,mycourtBootstrap:fs.existsSync(path.join(__dirname,'mycourt-bootstrap.enabled')),travelReplyBuilder:travelEnabled?require('./mycourt-travel.cjs').createMyCourtTravel(__dirname,entryResponder.matchId):null}:{});
    worldServer.listen(worldRoute.port,host,()=>console.log(`World socket listening on ${host}:${worldRoute.port} — painel: http://127.0.0.1:${worldRoute.port}/park`));
    server.on('close',()=>worldServer.close());
    if(entryMode==='single-player-bootstrap'){
      let relay;
      if(fs.existsSync(path.join(__dirname,'park-relay.enabled'))){
        // VCONLINE-compatible UDP relay for world sessions and lockstep court games.
        relay=require('./vconline-relay.cjs').startRelay({port:worldRoute.port,host,log:require('./park-capture.cjs').parkLogger(__dirname)});
        if(fs.existsSync(path.join(__dirname,'park-courts.enabled')))require('./park-courts.cjs').sharedHub(__dirname,require('./park-capture.cjs').parkLogger(__dirname)).relay=relay;
        console.log(`UDP relay listening on ${host}:${worldRoute.port}`);
      }else relay=require('./udp-relay-capture.cjs').startRelayCapture(worldRoute.port,path.join(__dirname,'captures'));
      server.on('close',()=>relay.close());
    }
  }
}
module.exports={createLab,ID};

