'use strict';
// Itens das lojas físicas (serviço 0xCD58A443), consumidos por ONLINESTORE::CACHE_MANAGER::SetStoreItemsCache (1405AF010).
// Engenharia reversa do exe 2K22 (SHA-256 1727ad72...):
//  pedido (1405A1F40): TAG 0x952EF509 = "PAGE:TKWORLD_NBA_STORE" etc., 0xD5E5F21D = save.
//  resposta: RESULT, VERSION 0x80592DD9 (u64; igual ao cache => ignora), ITEMS_JSON 0xA6B5B9F8 (zlib) +
//    ITEMS_JSON_SIZE 0xBF8684DD e itens possuídos 0x603BD442/0x5AB6FDF4 (mesmo formato de get_owned_items).
//  ITEMS_JSON (1405AD890 -> 1405AC3A0): array de { item_id, price, tag_crcs:[crc32("STORE_CATEGORY:...")],
//    limit, discount, name, desc }. item_id é a chave na base de itens do jogo (global 0x1463D59F0).
const zlib=require('node:zlib'),fs=require('node:fs'),path=require('node:path');
const {Builder,Crc32,GetField}=require(process.env.REFERENCE_CODEC||require('./reference-codecs.cjs').granitePath());
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'store-items.json'),'utf8'));
// Página pedida pelo jogo -> categorias LAB_* que ela vende.
const PAGES={
 'PAGE:TKWORLD_NBA_STORE':['NBA_JERSEYS','NBA_TOPS','NBA_OUTERWEAR','NBA_BOTTOMS','NBA_HATS'],
 'PAGE:TKWORLD_PARK_CLOTHING_STORE':['SWAG_TOPS','SWAG_OUTERWEAR','SWAG_BOTTOMS','SWAG_HATS','SWAG_GLASSES','SWAG_JEWELRY','SWAG_SLEEVES','SWAG_COMPRESSION','SWAG_SOCKS','SWAG_BACKPACKS','BRAND_NIKE','BRAND_JORDAN'],
 'PAGE:TKWORLD_FOOT_LOCKER':['SHOES','SHOES_NIKE','SHOES_JORDAN','SHOES_ADIDAS','SHOES_UA','SHOES_CONVERSE','SWAG_SOCKS'],
 'PAGE:TKWORLD_NIKE_STORE':['SHOES_NIKE','BRAND_NIKE'],
 'PAGE:TKWORLD_JORDAN_STORE':['SHOES_JORDAN','BRAND_JORDAN'],
 'PAGE:TKWORLD_UNDERARMOUR_STORE':['SHOES_UA'],
 'PAGE:TKWORLD_CONVERSE_STORE':['SHOES_CONVERSE'],
 'PAGE:TKWORLD_PUMA_STORE':['SHOES_PUMA','BRAND_PUMA'],
 'PAGE:TKWORLD_NEW_BALANCE_STORE':['SHOES_NEW_BALANCE'],
 'PAGE:TKWORLD_ADIDAS_STORE':['SHOES_ADIDAS','BRAND_ADIDAS'],
};
const PAGE_BY_CRC=new Map(Object.keys(PAGES).map(p=>[Crc32(p)>>>0,p]));
const tagCrc=data.tags.map(t=>Crc32('STORE_CATEGORY:LAB_'+t)|0);
function pageOf(field){
 if(!field)return null;
 for(const v of [field.Value,field.Data,field.String,field.Raw&&Buffer.isBuffer(field.Raw)?field.Raw.toString('utf8').replace(/\0+$/,''):null])
  if(typeof v==='string'&&PAGES[v])return v;
 if(field.Raw&&Buffer.isBuffer(field.Raw)){const w=field.Raw.toString('utf16le').replace(/\0+$/,'');if(PAGES[w])return w;}
 for(const v of [field.Data1,field.Value]) if(Number.isInteger(v)&&PAGE_BY_CRC.has(v>>>0))return PAGE_BY_CRC.get(v>>>0);
 return null;
}
function itemsFor(page,price){
 const wanted=page?new Set(PAGES[page].map(t=>data.tags.indexOf(t))):null;
 const rows=[];
 for(const [id,basePrice,tags] of data.items){
  const own=wanted?tags.filter(t=>wanted.has(t)):tags;
  if(!own.length)continue;
  rows.push({item_id:id|0,price:price===null?basePrice:price,tag_crcs:own.map(t=>tagCrc[t])});
 }
 return rows;
}
// price: null = preço da base do jogo; número = preço fixo (0 para contas com loja grátis).
function buildStoreItems(fields,{price=null,ownedRows=[],version=Math.floor(Date.now()/1000)}={}){
 const page=pageOf(fields?GetField(fields,0x952ef509):null);
 const raw=Buffer.from(JSON.stringify(itemsFor(page,price))+'\0','utf8');
 const owned=Buffer.from(JSON.stringify(ownedRows)+'\0','utf8');
 return {page,count:raw.length,builder:new Builder().AddU32(0xe3920695,0x504521a8).AddU64(0x80592dd9,BigInt(version))
  .AddU64(0xbf8684dd,BigInt(raw.length)).AddBinary(0xa6b5b9f8,zlib.deflateSync(raw,{level:6}))
  .AddU64(0x5ab6fdf4,BigInt(owned.length)).AddBinary(0x603bd442,zlib.deflateSync(owned))};
}
let priceMap=null;
// Preço original do jogo para um item (ou null se não estiver no catálogo).
function basePrice(id){if(!priceMap)priceMap=new Map(data.items.map(([i,p])=>[i>>>0,p]));return priceMap.get(id>>>0)??null;}
module.exports={basePrice,PAGES,itemsFor,buildStoreItems,pageOf};
