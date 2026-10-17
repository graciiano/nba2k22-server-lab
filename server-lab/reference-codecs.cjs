'use strict';
const path=require('node:path'),fs=require('node:fs');
function resolve(override,relative){const file=override||(process.env.REFERENCE_ROOT&&path.join(process.env.REFERENCE_ROOT,relative));if(!file||!fs.existsSync(file))throw Error('Configure REFERENCE_ROOT or REFERENCE_CODEC / REFERENCE_OPAL_CODEC. External 2K19 codecs are not bundled.');return path.resolve(file);}
module.exports={granitePath:()=>resolve(process.env.REFERENCE_CODEC,'Granite/Server/Source/Codec/FieldList.js'),opalPath:()=>resolve(process.env.REFERENCE_OPAL_CODEC,'Opal/Source/Codec/FieldList.js')};
