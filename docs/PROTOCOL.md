# Contratos recuperados

São descrições de uma implementação experimental para uma versão específica do cliente. Identificadores e RVAs servem para reproduzir a análise; não são especificação oficial.

| Serviço observado | Rota local |
| --- | --- |
| `B5C3A734` | `/Session/update` |
| `010A933A` | `/Accounts/get` |
| `A7CFB52A` | `/World/connect` |
| `BACF5B81` | `/MyCareer/Attributes/get` |
| `6DCBB27D` | `/MyCareer/Attributes/price` |
| `8C262990` | `/VirtualCurrency/balance` |
| `853DA8F7` | `/VirtualCurrency/purchase` — atributos |
| `5978B00C` | `/VirtualCurrency/get_prices` |
| `DCB93DA1` | `/VirtualCurrency/items/purchase` |
| `C39A9528` | `/StoreV4/get_owned_items` |
| `0635C793` | `/Text/validate` |

As rotas locais podem ter nomes escolhidos pelo laboratório. O vínculo observado no cliente é o CRC do serviço anunciado no manifesto.

## Animações e criações

- Consulta de preços: emissor `1413DBB50`, receptor `1413DBC40`; `ITEM_i` e preços indexados. Política privada de preço zero.
- Compra de itens: `1413DD420` seleciona `DCB93DA1`; `1413DD4C0` envia JSON comprimido com **zlib**, no campo `3D366503`. Os campos incluem item, tipo, quantidade, preço esperado e vínculo com save; customizações incluem `attribute`.
- Compra aceita: pares `FD76CFBD` (item) e `8F1FA615` (instância U64), consumidos por `1413DE482` / `1405AF630`.
- Inventário: `603BD442` contém uma tabela JSON comprimida; `5AB6FDF4` informa o tamanho descomprimido. O leitor `141E70660` recebe texto terminado em NUL. `1405AD670` e `1405ABE40` interpretam `item_id`, `instance_id` e atributos personalizados.
- Validação de nome: emissor `140F51970`, leitor `140F39EE0`, resultado de UI `140B4B9B0`. O pedido real usa UTF-16 sob o CRC `6E46752F`, com tamanho em bytes; a resposta contém booleanos indexados sob o mesmo CRC.

O valor zero do identificador de save foi observado em builds locais e é aceito. Builds que enviam o mesmo identificador zero compartilham esse escopo no laboratório; não se deve afirmar que ele identifica de forma única todos os arquivos de save.

## Mundo e MyCourt

O envelope WebSocket tem 16 bytes antes do conteúdo: tamanho LE, identificador de pacote BE e identificador de conexão. O adaptador aceita o formato de chave de handshake observado no cliente, diferente do formato RFC habitual.

Objetos observados: Player `2C5D2702`, Court `2C4D49E3`, sala MyCourt `16A0D01E`. Os tamanhos dos bitmaps recuperados são 165, 148 e 30 bits. O protótipo trata somente o pedido solo observado e um participante.

A correção do tipo de quadra 31 para 33 foi validada pelo início da gameplay solo relatado pelo usuário. Isso não implica que todos os modos de treino ou partidas tenham o mesmo contrato.

## Limitações de evidência

Esta publicação resume os achados; bancos de análise, dumps de memória e capturas reais não são distribuídos. Os testes sintéticos verificam contratos implementados, mas não reproduzem o jogo completo. A confirmação visual veio de testes manuais no cliente local.
