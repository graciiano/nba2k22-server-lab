'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),z=require('node:zlib');
const c=require(require('./reference-codecs.cjs').granitePath());
const {createLab,ID}=require('./server.cjs');
const {createItemInventory}=require('./item-inventory.cjs');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nba2k22-public-test-'));
 const server=createLab({experimentalLogin:true,captureDir:path.join(directory,'captures')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const request=(route,builder)=>new Promise((resolve,reject)=>{const body=builder.Build().Body;const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:route,method:'POST'},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end(body);});
 const decode=b=>c.Parse(b).Fields;
 try{
  const login=await request('/Session/login',new c.Builder().AddU64(0x01caaee8,1n));assert.equal(login.status,200);
  const key=c.GetU64(decode(login.body),ID.key);assert.ok(key>0n);
  const nameBytes=Buffer.alloc(10);for(const [i,v] of [...'Jump'].entries())nameBytes.writeUInt16BE(v.charCodeAt(0),i*2);
  const names=await request('/Text/validate?x='+key,new c.Builder().AddBinary(0x6e46752f,nameBytes,c.Types.String16));
  assert.equal(names.status,200);assert.equal(c.GetField(decode(names.body),0x6e46752f).value,true);
  const prices=await request('/VirtualCurrency/get_prices?x='+key,new c.Builder().AddU32(c.Crc32('ITEM_0'),123));assert.equal(prices.status,200);{const pol=JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname,'progression-policy.json'),'utf8'));const expected=Array.isArray(pol.freeShopAccounts)?BigInt(pol.shopPriceOthers??1000):0n;assert.equal(c.GetU64(decode(prices.body),c.Crc32('PRICE_0')),expected);}
  {const items=await request('/StoreV4/get_items?x='+key,new c.Builder().AddString8(0x952ef509,'PAGE:TKWORLD_FOOT_LOCKER'));assert.equal(items.status,200);const f=decode(items.body),raw=z.inflateSync(c.GetField(f,0xa6b5b9f8).Raw);assert.equal(BigInt(raw.length),c.GetU64(f,0xbf8684dd));const rows=JSON.parse(raw.subarray(0,-1));assert.ok(rows.length>100&&rows.every(r=>Number.isInteger(r.item_id)&&r.tag_crcs.length>0));assert.ok(c.GetU64(f,0x80592dd9)>0n);}
  const layout=await request('/StoreV4/get_layout?x='+key,new c.Builder().AddU32(0x952ef509,1));assert.equal(layout.status,200);{const lf=decode(layout.body),doc=JSON.parse(z.inflateSync(c.GetField(lf,0xe1e79306).Raw).subarray(0,-1));assert.ok(doc.version>0&&doc.SWAGS.length>0&&doc.SWAGS[0][0][0].tag==='STORE_CATEGORY:LAB_SWAG_TOPS'&&doc.WHEELZ.length>0);assert.equal(c.GetU64(lf,0x6cb1bd26),BigInt(z.inflateSync(c.GetField(lf,0xe1e79306).Raw).length));}
  const proposals=[{item_crc:123,item_type:0x298ec8aa,count:1,savebound:true,expected_price:0}];
  const purchase=()=>new c.Builder().AddBinary(0x3d366503,z.deflateSync(Buffer.from(JSON.stringify(proposals)))).AddU64(0xd5e5f21d,0n);
  const bought=await request('/VirtualCurrency/items/purchase?x='+key,purchase());assert.equal(bought.status,200);assert.ok(c.GetU64(decode(bought.body),0x8f1fa615)>0n);
  assert.equal((await request('/VirtualCurrency/items/purchase?x='+key,purchase())).status,200);
  const owned=await request('/StoreV4/get_owned_items?x='+key,new c.Builder().AddU64(0xd5e5f21d,0n));assert.equal(owned.status,200);
  const fields=decode(owned.body),raw=z.inflateSync(c.GetField(fields,0x603bd442).Raw);assert.equal(raw.at(-1),0);assert.equal(BigInt(raw.length),c.GetU64(fields,0x5ab6fdf4));assert.equal(JSON.parse(raw.subarray(0,-1)).length,1);
  assert.equal((await request('/Text/validate?x=0',new c.Builder().AddString8(0x6e46752f,'Jump'))).status,401);
  const restored=createItemInventory(path.join(directory,'captures'));const query=c.Parse(new c.Builder().AddU64(0xd5e5f21d,0n).Build().Body).Fields;
  const reply=decode(restored.inventory('1',query).Build().Body);assert.ok(c.GetU64(reply,0x5ab6fdf4)>3n);
  const other=decode(restored.inventory('2',query).Build().Body);assert.equal(z.inflateSync(c.GetField(other,0x603bd442).Raw).toString(),'[]\0');
  console.log('PASS: synthetic HTTP sessions, UTF16 names, zero prices, durable inventory, idempotency and account isolation');
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

