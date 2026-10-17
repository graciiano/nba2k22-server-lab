'use strict';
const {Builder,Crc32,GetField,GetU32,Types}=require(process.env.REFERENCE_CODEC||require('./reference-codecs.cjs').granitePath());
// 2K22 emitter 1413DBB50 and receiver 1413DBC40: indexed item CRCs,
// indexed U64 prices. Zero is the private laboratory pricing policy.
function buildItemPrices(fields){
 const items=[];
 for(let i=0;i<512;i++){
  const crc=Crc32(`ITEM_${i}`),f=GetField(fields,crc);
  if(!f)break;
  if(f.Type!==Types.StringCrc||!f.Data1)throw Error('Invalid item price identifier');
  items.push(GetU32(fields,crc));
 }
 if(!items.length||GetField(fields,Crc32('ITEM_512')))throw Error('Invalid item price count');
 const out=new Builder().AddU32(0xe3920695,0x504521a8);
 items.forEach((item,i)=>{
  out.AddU32(Crc32(`ITEM_${i}`),item);
  for(const prefix of ['FINAL_PRICE','PRICE','FINAL_MYTEAM_PRICE','MYTEAM_PRICE'])out.AddU64(Crc32(`${prefix}_${i}`),0n);
 });
 return out;
}
module.exports={buildItemPrices};
