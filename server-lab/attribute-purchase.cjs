'use strict';
const {Builder,GetFields,GetU32,GetU64,Crc32}=require(process.env.REFERENCE_CODEC||require('./reference-codecs.cjs').granitePath());
// Native emitter 1413DD7B0 and receiver 1413DE260; levels are internal 0..75.
function readAttributePurchase(fields){
 const names=GetFields(fields,0xfd76cfbd);if(!names.length||names.length>24)throw Error('Invalid purchase count');
 const rows=[];const seen=new Set();
 for(let i=0;i<names.length;i++){
  const name=GetU32(fields,0xfd76cfbd,i);
  const from=GetU64(fields,Crc32(`ITEM${i}_FROM_LEVEL`));
  const to=GetU64(fields,Crc32(`ITEM${i}_TO_LEVEL`));
  const price=GetU64(fields,Crc32(`ITEM${i}_PRICE`));
  const save=GetU64(fields,Crc32(`ITEM${i}_CLOUD_SAVE_ID`));
  if(!name||seen.has(name)||from===null||to===null||from<0n||to<=from||to>75n||price!==0n||save===null)throw Error('Unsupported attribute purchase');
  seen.add(name);rows.push({name,from,to,save});
 }
 return rows;
}
function buildAttributePurchase(rows){
 const b=new Builder().AddU32(0xe3920695,0x504521a8).AddU64(0x93b1e1e4,2000000n);
 for(const row of rows)b.AddU32(0x2f228fb7,row.name).AddU64(0x1d85f783,row.from).AddU64(0x8f3e5552,row.to);
 return b;
}
module.exports={readAttributePurchase,buildAttributePurchase};
