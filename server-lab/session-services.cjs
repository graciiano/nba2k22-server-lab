'use strict';
const zlib=require('node:zlib');
const {Builder}=require(process.env.REFERENCE_CODEC || require('./reference-codecs.cjs').granitePath());
const services=[{id:0xb5c3a734,url:'https://127.0.0.1:21022/Session/update',method:'POST'},{id:0x010a933a,url:'https://127.0.0.1:21022/Accounts/get',method:'POST'},{id:0xa7cfb52a,url:'https://127.0.0.1:21022/World/connect',method:'POST'},
 // Observed 2K22 lookup in ONLINESTORE_CHECKINVENTORY_JOB_WITH_CUSTOM...
 // Experimental native inventory reply, persisted per account/build.
 {id:0xc39a9528,url:'https://127.0.0.1:21022/StoreV4/get_owned_items',method:'POST'},
 // 1413BB580 (lojas físicas): layout/catálogo das lojas, resposta em store-layout.cjs.
 {id:0x8f8f3e0c,url:'https://127.0.0.1:21022/StoreV4/get_layout',method:'POST'},
 // 1405A1F40 (lojas físicas): itens da página da loja, resposta em store-items.cjs.
 {id:0xcd58a443,url:'https://127.0.0.1:21022/StoreV4/get_items',method:'POST'},
 {id:0xbacf5b81,url:'https://127.0.0.1:21022/MyCareer/Attributes/get',method:'POST'},
 {id:0x6dcbb27d,url:'https://127.0.0.1:21022/MyCareer/Attributes/price',method:'POST'},
 {id:0x8c262990,url:'https://127.0.0.1:21022/VirtualCurrency/balance',method:'POST'},
 {id:0x5978b00c,url:'https://127.0.0.1:21022/VirtualCurrency/get_prices',method:'POST'},
 {id:0x0635c793,url:'https://127.0.0.1:21022/Text/validate',method:'POST'},
 // Native 1413DD420 selects this service for item/custom purchases.
 // Bounded native common/custom item proposals; zero-cost private policy.
 {id:0xdcb93da1,url:'https://127.0.0.1:21022/VirtualCurrency/items/purchase',method:'POST'},
 // Native attribute purchases only; shop/animation purchases are not accepted.
 {id:0x853da8f7,url:'https://127.0.0.1:21022/VirtualCurrency/purchase',method:'POST'}];
function buildServices(){
 const b=new Builder();
 for(const service of services){
  b.AddU32(0xc493acfe,service.id).AddString8(0x12bbf3ab,service.url).AddString8(0xa78a16c7,service.method);
  // sub_1420842E0 selects VCFIELDLIST_SIZE for this enum under this field CRC.
  b.AddU32(0x8bbc3f05,0xb6c95773);
 }
 return zlib.gzipSync(b.Build().Body);
}
module.exports={services,buildServices};
