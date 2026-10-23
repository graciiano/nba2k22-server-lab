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

// Os itens são ligados pela tag "STORE_CATEGORY:<categoria>" (como no layout padrão embutido no exe para
// WHEELZ/TATTOOS/BARBERSHOP/GATORADE). Categorias = enum 14240CF60 (246 nomes; os conhecidos estão abaixo).
const STORES={
 NBASTORE:[['NBA_SHIRTS_ALL','Camisetas NBA'],['NBA_HOODIES_AND_OUTERWEAR','Moletons e casacos'],['NBA_PANTS_AND_SHORTS','Calças e shorts'],
  ['NBA_MITCHELL_NESS','Mitchell & Ness'],['NBA_OTHER_TEAM_HATS','Bonés de times'],['NBA_ACCESSORIES','Acessórios NBA'],
  ['NBA_GLASSES','Óculos NBA'],['NBA_ALLSTAR','All-Star'],['NBA_HOLIDAY','Festas'],['NBA_MISC1','Coleção NBA'],['NBA_MISC2','Mais NBA']],
 SWAGS:[['SWAG_SHIRTS','Camisetas'],['SWAG_PREMIUM_SHIRTS','Camisetas premium'],['SWAG_HOODIES_AND_OUTERWEAR','Moletons e casacos'],
  ['SWAG_PANTS_AND_SHORTS','Calças e shorts'],['SWAG_HATS','Bonés e chapéus'],['SWAG_ACCESSORIES','Acessórios'],
  ['SWAG_JEWELRY','Joias'],['SWAG_GLASSES','Óculos'],['SWAG_EQUIPMENT','Equipamentos'],['SWAG_NIKE','Nike'],['SWAG_JORDAN','Jordan'],
  ['SWAG_ADIDAS','adidas'],['SWAG_UA','Under Armour'],['SWAG_PROAM','Pro-Am'],['SWAG_HOLIDAY','Festas'],['SWAG_MISC1','Coleção'],['SWAG_MISC2','Mais roupas']],
 FOOTLOCKER:[['SHOE_NBA_NIKE','Nike'],['SHOE_NBA_NIKE_JORDAN','Jordan'],['SHOE_NBA_ADIDAS','adidas'],['SHOE_NBA_CONVERSE','Converse'],
  ['SHOE_NBA_REEBOK','Reebok'],['SHOE_NBA','Tênis NBA'],['SHOE_MISC1','Coleção de tênis'],['SHOE_MISC2','Mais tênis']],
 NIKE_STORE:[['SWAG_NIKE','Roupas Nike'],['SHOE_NBA_NIKE','Tênis Nike']],
 JORDAN_STORE:[['SWAG_JORDAN','Roupas Jordan'],['SHOE_NBA_NIKE_JORDAN','Tênis Jordan']],
 UNDERARMOUR_STORE:[['SWAG_UA','Under Armour']],
 CONVERSE_STORE:[['SHOE_NBA_CONVERSE','Converse']],
 PUMA_STORE:[['SHOE_MISC1','Tênis'],['SWAG_MISC1','Roupas']],
 NEW_BALANCE_STORE:[['SHOE_MISC2','Tênis'],['SWAG_MISC2','Roupas']],
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
