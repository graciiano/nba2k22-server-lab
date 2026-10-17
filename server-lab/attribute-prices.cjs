'use strict';
const {Builder}=require(process.env.REFERENCE_CODEC||require('./reference-codecs.cjs').granitePath());
const F={name:0x68b693b2,level:0x6dbe0ea3,count:0x3526dbfb,to:0x50496459,price:0x3d9ce069,second:0xe9fcbd20};
function buildAttributePrices(fields,policy={base:0n,step:0n}){
 const names=fields.filter(f=>f.Crc===F.name),levels=fields.filter(f=>f.Crc===F.level);
 if(!names.length||names.length>32||levels.length!==names.length)throw new Error('Attribute price rows must have paired names and levels');
 const base=BigInt(policy.base),step=BigInt(policy.step);
 if(base<0n||step<0n||base+75n*step>0x7fffffffn)throw new Error('Invalid laboratory price policy');
 const rows=names.map((f,i)=>{
  if(f.Type!==0x1423add2||levels[i].Type!==0x3d9e5089)throw new Error('Invalid attribute price field types');
  const level=(BigInt(levels[i].Data1>>>0)<<32n)|BigInt(levels[i].Data2>>>0);
  if(level>75n)throw new Error('Attribute level exceeds native price table range');
  return {name:f.Data1>>>0,level};
 });
 if(new Set(rows.map(r=>r.name)).size!==rows.length)throw new Error('Duplicate attribute names');
 const builder=new Builder();
 for(const row of rows)builder.AddU32(F.name,row.name).AddU64(F.level,row.level).AddU64(F.count,75n-row.level);
 for(const row of rows)for(let to=row.level+1n;to<=75n;to++){
  const cost=base+(to-1n)*step;builder.AddU64(F.to,to).AddU64(F.price,cost).AddU64(F.second,cost);
 }
 return builder.AddU32(0xe3920695,0x504521a8);
}
module.exports={buildAttributePrices,F};
