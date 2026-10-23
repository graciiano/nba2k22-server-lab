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
 'PAGE:TKWORLD_NBA_STORE':['STORE_CATEGORY:LAB_NBA_JERSEYS','STORE_CATEGORY:LAB_NBA_TOPS','STORE_CATEGORY:LAB_NBA_OUTERWEAR','STORE_CATEGORY:LAB_NBA_BOTTOMS','STORE_CATEGORY:LAB_NBA_HATS'],
 'PAGE:TKWORLD_PARK_CLOTHING_STORE':['STORE_CATEGORY:LAB_SWAG_TOPS','STORE_CATEGORY:LAB_SWAG_OUTERWEAR','STORE_CATEGORY:LAB_SWAG_BOTTOMS','STORE_CATEGORY:LAB_SWAG_HATS','STORE_CATEGORY:LAB_SWAG_GLASSES','STORE_CATEGORY:LAB_SWAG_JEWELRY','STORE_CATEGORY:LAB_SWAG_SLEEVES','STORE_CATEGORY:LAB_SWAG_COMPRESSION','STORE_CATEGORY:LAB_SWAG_SOCKS','STORE_CATEGORY:LAB_SWAG_BACKPACKS','STORE_CATEGORY:LAB_BRAND_NIKE','STORE_CATEGORY:LAB_BRAND_JORDAN'],
 'PAGE:TKWORLD_FOOT_LOCKER':['STORE_CATEGORY:LAB_SHOES','STORE_CATEGORY:LAB_SHOES_NIKE','STORE_CATEGORY:LAB_SHOES_JORDAN','STORE_CATEGORY:LAB_SHOES_ADIDAS','STORE_CATEGORY:LAB_SHOES_UA','STORE_CATEGORY:LAB_SHOES_CONVERSE','STORE_CATEGORY:LAB_SWAG_SOCKS'],
 'PAGE:TKWORLD_NIKE_STORE':['STORE_CATEGORY:LAB_SHOES_NIKE','STORE_CATEGORY:LAB_BRAND_NIKE'],
 'PAGE:TKWORLD_JORDAN_STORE':['STORE_CATEGORY:LAB_SHOES_JORDAN','STORE_CATEGORY:LAB_BRAND_JORDAN'],
 'PAGE:TKWORLD_UNDERARMOUR_STORE':['STORE_CATEGORY:LAB_SHOES_UA'],
 'PAGE:TKWORLD_CONVERSE_STORE':['STORE_CATEGORY:LAB_SHOES_CONVERSE'],
 'PAGE:TKWORLD_PUMA_STORE':['STORE_CATEGORY:LAB_SHOES_PUMA','STORE_CATEGORY:LAB_BRAND_PUMA'],
 'PAGE:TKWORLD_NEW_BALANCE_STORE':['STORE_CATEGORY:LAB_SHOES_NEW_BALANCE'],
 'PAGE:TKWORLD_ADIDAS_STORE':['STORE_CATEGORY:LAB_SHOES_ADIDAS','STORE_CATEGORY:LAB_BRAND_ADIDAS'],
 'PAGE:TKWORLD_TATTOO_PARLOR':['SLEEVES','ANIMALS','PREMIUM','NBA','LETTERS_AND_NUMBERS','MISCELLANEOUS'].map(t=>'STORE_CATEGORY:TATTOO_'+t),
};
const PAGE_BY_CRC=new Map(Object.keys(PAGES).map(p=>[Crc32(p)>>>0,p]));
const tagCrc=data.tags.map(t=>Crc32(t)|0);
function pageOf(field){
 if(!field)return null;
 for(const v of [field.value,field.Value,field.Data,field.String,field.Raw&&Buffer.isBuffer(field.Raw)?field.Raw.toString('utf8').replace(/\0+$/,''):null])
  if(typeof v==='string'&&PAGES[v.replace(/\0+$/,'')])return v.replace(/\0+$/,'');
 if(field.Raw&&Buffer.isBuffer(field.Raw)){const w=field.Raw.toString('utf16le').replace(/\0+$/,'');if(PAGES[w])return w;}
 for(const v of [field.Data1,field.Value]) if(Number.isInteger(v)&&PAGE_BY_CRC.has(v>>>0))return PAGE_BY_CRC.get(v>>>0);
 return null;
}
// O jogo manda TAG como String16 mas o corpo chega cortado (ex.: "PAGE:TKWORLD_TATTOO_PARLO" + lixo), então o
// codec não consegue ler o valor. Lê o UTF-16 direto do corpo e escolhe a página com o maior prefixo em comum.
function pageFromBody(body){
 if(!Buffer.isBuffer(body))return null;
 const at=body.indexOf(Buffer.from('PAGE:','utf16le'));
 if(at<0)return null;
 let text='';
 for(let i=at;i+1<body.length;i+=2){const ch=body.readUInt16LE(i);if(!/[A-Z0-9_:]/.test(String.fromCharCode(ch)))break;text+=String.fromCharCode(ch);}
 let best=null,bestLen=0,tie=false;
 for(const key of Object.keys(PAGES)){
  let n=0;while(n<key.length&&n<text.length&&key[n]===text[n])n++;
  if(n>bestLen){best=key;bestLen=n;tie=false;}else if(n===bestLen)tie=true;
 }
 return best&&!tie&&bestLen>=Math.min(best.length,text.length)-1&&bestLen>=14?best:null;
}
function itemsFor(page,price){
 // Página desconhecida (barbearia, Wheelz...): nenhum item; mandar o catálogo inteiro fazia a loja de tatuagem
 // tentar provar roupas como tatuagem e o jogo fechava.
 if(!page)return [];
 const wanted=new Set(PAGES[page].map(t=>data.tags.indexOf(t)));
 const rows=[];
 for(const [id,basePrice,tags] of data.items){
  const own=tags.filter(t=>wanted.has(t));
  if(!own.length)continue;
  rows.push({item_id:id|0,price:price===null?basePrice:price,tag_crcs:own.map(t=>tagCrc[t])});
 }
 return rows;
}
// price: null = preço da base do jogo; número = preço fixo (0 para contas com loja grátis).
function buildStoreItems(fields,{price=null,ownedRows=[],version=Math.floor(Date.now()/1000),body=null}={}){
 const page=pageOf(fields?GetField(fields,0x952ef509):null)||pageFromBody(body);
 const raw=Buffer.from(JSON.stringify(itemsFor(page,price))+'\0','utf8');
 const owned=Buffer.from(JSON.stringify(ownedRows)+'\0','utf8');
 return {page,count:raw.length,builder:new Builder().AddU32(0xe3920695,0x504521a8).AddU64(0x80592dd9,BigInt(version))
  .AddU64(0xbf8684dd,BigInt(raw.length)).AddBinary(0xa6b5b9f8,zlib.deflateSync(raw,{level:6}))
  .AddU64(0x5ab6fdf4,BigInt(owned.length)).AddBinary(0x603bd442,zlib.deflateSync(owned))};
}
let priceMap=null;
// Preço original do jogo para um item (ou null se não estiver no catálogo).
function basePrice(id){if(!priceMap)priceMap=new Map(data.items.map(([i,p])=>[i>>>0,p]));return priceMap.get(id>>>0)??null;}
// Todos os itens vendidos numa página (para liberar na conta grátis).
function pageItemIds(page){return itemsFor(page,0).map(r=>r.item_id>>>0);}
module.exports={pageFromBody,pageItemIds,basePrice,PAGES,itemsFor,buildStoreItems,pageOf};
