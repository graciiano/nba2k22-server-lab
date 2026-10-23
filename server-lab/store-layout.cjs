'use strict';
// Layout das lojas físicas (serviço 0x8F8F3E0C), consumido por ONLINESTORE::CACHE_MANAGER::SetStoreLayoutCache.
// Engenharia reversa do exe 2K22 (SHA-256 1727ad72...):
//  callback 1413BB240: lê 0xE1E79306 (JSON zlib) e 0x6CB1BD26 (tamanho), JSON -> 1405AF580 -> 1405ACD20.
//  1405ACD20: "version" (int, precisa ser maior que o cache atual); para cada loja da tabela 14240CB10
//    (NBASTORE, SWAGS, FOOTLOCKER, BEATS_HEADPHONES, BEATS_CLOTHING, WHEELZ, TATTOOS, BARBERSHOP, GATORADE,
//     ?, CONVERSE_STORE, JORDAN_STORE, NEW_BALANCE_STORE, NIKE_STORE, PUMA_STORE, ?, UNDERARMOUR_STORE, PARK_AFTER_DARK)
//    busca a chave com esse nome; valor = páginas[ linhas[ células ] ] (1405AE7A0).
//  célula 1405AC5E0: cell_type (TEAM_PICKER é especial), cell_size (ONE_BY_ONE, ONE_BY_TWO, ONE_BY_THREE,
//    TWO_BY_ONE, TWO_BY_TWO, TWO_BY_THREE), flag (NONE, NEW, SALE), title, description, logo_guid,
//    children (subcélulas) ou tag (categoria de itens, ex. SWAG_SHIRTS; tabela 142BF1050).
//  cell_size e flag fora da tabela fazem a célula ser rejeitada.
const zlib=require('node:zlib');
const {Builder}=require(process.env.REFERENCE_CODEC||require('./reference-codecs.cjs').granitePath());

// Os itens são ligados pela tag "STORE_CATEGORY:<categoria>": cada item da resposta de itens (store-items.cjs,
// serviço 0xCD58A443) traz tag_crcs = CRC32 dessas tags, e a célula com a mesma tag mostra esses itens.
// As categorias LAB_* são nossas (geradas a partir da base de itens do jogo, store-items.json).
const T=(tag,title)=>['LAB_'+tag,title];
const STORES={
 NBASTORE:[T('NBA_JERSEYS','Camisas de jogo'),T('NBA_TOPS','Camisetas'),T('NBA_OUTERWEAR','Moletons e casacos'),
  T('NBA_BOTTOMS','Calças e shorts'),T('NBA_HATS','Bonés')],
 SWAGS:[T('SWAG_TOPS','Camisetas'),T('SWAG_OUTERWEAR','Moletons e casacos'),T('SWAG_BOTTOMS','Calças e shorts'),
  T('SWAG_HATS','Bonés e chapéus'),T('SWAG_GLASSES','Óculos e máscaras'),T('SWAG_JEWELRY','Joias e relógios'),
  T('SWAG_SLEEVES','Mangas, faixas e fitas'),T('SWAG_COMPRESSION','Compressão'),T('SWAG_SOCKS','Meias'),
  T('SWAG_BACKPACKS','Mochilas'),T('BRAND_NIKE','Nike'),T('BRAND_JORDAN','Jordan')],
 FOOTLOCKER:[T('SHOES','Todos os tênis'),T('SHOES_NIKE','Nike'),T('SHOES_JORDAN','Jordan'),T('SHOES_ADIDAS','adidas'),
  T('SHOES_UA','Under Armour'),T('SHOES_CONVERSE','Converse'),T('SWAG_SOCKS','Meias')],
 NIKE_STORE:[T('SHOES_NIKE','Tênis Nike'),T('BRAND_NIKE','Roupas Nike')],
 JORDAN_STORE:[T('SHOES_JORDAN','Tênis Jordan'),T('BRAND_JORDAN','Roupas Jordan')],
 UNDERARMOUR_STORE:[T('SHOES_UA','Tênis Under Armour')],
 CONVERSE_STORE:[T('SHOES_CONVERSE','Tênis Converse')],
 PUMA_STORE:[T('SHOES_PUMA','Tênis Puma'),T('BRAND_PUMA','Roupas Puma')],
 NEW_BALANCE_STORE:[T('SHOES_NEW_BALANCE','Tênis New Balance')],
};
function cell(category,title,store){return {cell_size:'ONE_BY_ONE',cell_type:'TAG',store_type:store,description:'',title,flag:'NONE',tag:'STORE_CATEGORY:'+category,logo_guid:''};}
function layoutDocument(version=1){
 const doc={version};
 for(const [store,sections] of Object.entries(STORES)){
  const pages=[];
  for(let i=0;i<sections.length;i+=6){
   const cells=sections.slice(i,i+6).map(([tag,title])=>cell(tag,title,store));
   pages.push(cells.length>3?[cells.slice(0,3),cells.slice(3)]:[cells]);
  }
  doc[store]=pages;
 }
 // WHEELZ, TATTOOS, BARBERSHOP e GATORADE: layout padrão que vem embutido no próprio exe.
 Object.assign(doc,require('./store-layout-default.json'));
 return doc;
}
// version: o cliente só aceita layout com version maior que o que já tem em cache; usar algo crescente.
function buildStoreLayout(version=Math.floor(Date.now()/1000)){
 const raw=Buffer.from(JSON.stringify(layoutDocument(version))+'\0','utf8');
 return new Builder().AddU32(0xe3920695,0x504521a8).AddU64(0x6cb1bd26,BigInt(raw.length)).AddBinary(0xe1e79306,zlib.deflateSync(raw,{level:9}));
}
module.exports={STORES,layoutDocument,buildStoreLayout};
