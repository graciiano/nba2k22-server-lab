'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const c=require(process.env.REFERENCE_CODEC||require('./reference-codecs.cjs').granitePath());
const CUSTOM_IDS=new Set([0x5fda268a,0x28dd161c,0xb1d447a6,0xc6d37730,0x58b7e293,0x2fb0d205]);
function readItemPurchase(fields){
 const blob=c.GetField(fields,0x3d366503);
 if(!blob||blob.Type!==c.Types.Binary||!Buffer.isBuffer(blob.Raw))throw Error('Missing item payload');
 const rows=JSON.parse(zlib.inflateSync(blob.Raw,{maxOutputLength:262144}).toString('utf8'));
 if(!Array.isArray(rows)||!rows.length||rows.length>32)throw Error('Invalid item count');
 const save=c.GetU64(fields,0xd5e5f21d);
 return rows.map(row=>{
  if(!row||!Number.isInteger(row.item_crc)||row.item_crc<1||row.item_crc>0xffffffff||row.count!==1||typeof row.savebound!=='boolean'||row.expected_price!==0)throw Error('Unsupported item proposal');
  // Local builds can legitimately submit cloud-save ID zero (captured client).
  if(row.savebound&&save===null)throw Error('Missing build binding');
  const custom=row.item_type===0xf72245fd;
  if(row.item_type!==0x298ec8aa&&!custom)throw Error('Unsupported item type');
  const attribute={};
  if(custom){
   if(!CUSTOM_IDS.has(row.item_crc)||!row.attribute||typeof row.attribute!=='object'||Array.isArray(row.attribute))throw Error('Invalid custom item');
   for(const k of ['thumbnail','guid','name','vendor']){
    const v=row.attribute[k];if(typeof v!=='string'||v.length>4096||v.includes('\0'))throw Error('Invalid custom attribute');attribute[k]=v;
   }
   if(!attribute.guid||!attribute.name||!Number.isSafeInteger(row.attribute.category))throw Error('Missing custom attributes');
   attribute.category=row.attribute.category;
  }else if(row.attribute!==undefined)throw Error('Unexpected common item attributes');
  return {item_id:row.item_crc,custom,attribute,save:row.savebound?save.toString():null};
 });
}
function createItemInventory(directory){
 const file=path.join(directory,'item-inventory.json');
 function load(){if(!fs.existsSync(file))return {version:1,next:1,accounts:{}};const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.version!==1||!Number.isSafeInteger(data.next)||data.next<1||!data.accounts||typeof data.accounts!=='object')throw Error('Invalid local inventory');return data;}
 function owner(user){if(!user||user==='0')throw Error('Missing account identity');return crypto.createHash('sha256').update('items:'+user).digest('hex');}
 function purchase(user,fields){
  const proposals=readItemPurchase(fields),data=load(),key=owner(user),owned=data.accounts[key]||[],accepted=[];
  for(const proposal of proposals){
   let item=owned.find(x=>x.item_id===proposal.item_id&&x.save===proposal.save&&(!proposal.custom||x.attribute.guid===proposal.attribute.guid));
   if(item){if(proposal.custom)item.attribute=proposal.attribute;}
   else{if(data.next>=Number.MAX_SAFE_INTEGER)throw Error('Inventory identifier exhausted');item={...proposal,instance_id:data.next++};owned.push(item);}
   accepted.push(item);
  }
  data.accounts[key]=owned;fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(data));fs.renameSync(file+'.tmp',file);
  // 1413DE482 ->1405AF630: repeated item CRCs and U64 instance IDs.
  const reply=new c.Builder().AddU32(0xe3920695,0x504521a8).AddU64(0x93b1e1e4,2000000n);
  for(const item of accepted)reply.AddU32(0xfd76cfbd,item.item_id).AddU64(0x8f1fa615,BigInt(item.instance_id));
  return reply;
 }
 function inventory(user,fields){
  const save=c.GetU64(fields,0xd5e5f21d),owned=load().accounts[owner(user)]||[];
  const rows=owned.filter(x=>x.save===null||(save!==null&&x.save===save.toString())).map(x=>({item_id:x.item_id,instance_id:x.instance_id,...(x.custom?{attribute:x.attribute}:{})}));
  // Native 1405975E0 ->1405A3430: zlib-compressed JSON table and U64 size.
  // JSON is parsed into native nested FieldLists consumed by1405AD670/1405ABE40.
  // 141E70660 takes a C string, so reserve an explicit terminator.
  const raw=Buffer.from(JSON.stringify(rows)+'\0');
  return new c.Builder().AddU32(0xe3920695,0x504521a8).AddBinary(0x603bd442,zlib.deflateSync(raw)).AddU64(0x5ab6fdf4,BigInt(raw.length));
 }
 return {purchase,inventory};
}
module.exports={readItemPurchase,createItemInventory};


