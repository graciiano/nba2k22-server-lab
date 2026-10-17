'use strict';
const {Builder,GetFields,Types}=require(process.env.REFERENCE_CODEC||require('./reference-codecs.cjs').granitePath());
// 140F51970 sends up to ten names under CRC6E46752F; the native
// captured request uses String16 (7A4D534C), despite CRC matching String8.
// 140F39EE0 reads indexed Bool8 results; 140B4B9B0 accepts true.
function buildNameValidation(fields,data){
 const names=GetFields(fields,0x6e46752f);
 if(!names.length||names.length>10||names.some(f=>![Types.String8,Types.String16].includes(f.Type)))throw Error('Invalid name validation batch');
 const out=new Builder().AddU32(0xe3920695,0x504521a8);
 for(const field of names){
  let name=field.value;
  if(field.Type===Types.String16){
   // Captured 2K22 String16 Data2 is a byte count, unlike the reference codec.
   if(!Buffer.isBuffer(data)||field.Data2<2||field.Data2>1024||field.Data2%2||field.Data1+field.Data2>data.length)throw Error('Invalid UTF16 name bounds');
   const units=[];for(let at=field.Data1;at<field.Data1+field.Data2;at+=2){const unit=data.readUInt16BE(at);if(unit===0)break;units.push(unit);}name=String.fromCharCode(...units);
  }
  if(typeof name!=='string')throw Error('Invalid name encoding');
  out.AddBool(0x6e46752f,name.trim().length>0&&name.length<512&&!/[\x00-\x1f\x7f]/.test(name));}
 return out;
}
module.exports={buildNameValidation};


