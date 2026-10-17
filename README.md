# NBA 2K22 Server Lab

Laboratório experimental de protocolo e servidor local para NBA 2K22 de PC. O objetivo é reconstruir os serviços necessários ao MyCareer, ao Park e ao MyCourt, com a intenção futura de jogar com amigos.

**Ainda não é um servidor multiplayer completo.** Entrar e caminhar no Park local não comprova sincronização entre jogadores, matchmaking ou partidas online. O projeto está em desenvolvimento e depende da versão exata do executável analisado.

## Estado em 17 de outubro de 2026

| Recurso | Situação |
| --- | --- |
| Sessão e conta do laboratório | Respostas experimentais implementadas |
| Entrada e movimentação no Park | Confirmadas manualmente em um cliente |
| Compra de atributos sem custo | Confirmada; atributos permaneceram após voltar ao menu e à build |
| Progressão além de 85 OVR | Confirmada manualmente após corrigir o orçamento de upgrades |
| Badges | Ajustadas para respeitar o potencial da build; confirmação manual |
| Saldo local de 2 milhões de VC | Implementado; não representa moeda ou conta oficial |
| Bloqueio do fluxo de compra de VC | Módulo local para evitar o modal que ficava carregando |
| Entrada no MyCourt | Confirmada; primeira entrada pode falhar e exigir nova tentativa |
| Gameplay solo no MyCourt | Início confirmado após corrigir o tipo de quadra para 33 |
| Compra e equipamento de animações | Confirmados manualmente |
| Criar, salvar e equipar jump shot | Confirmados manualmente após corrigir a validação do nome |
| Inventário de itens/criações | Persistência local implementada e testada; recuperação visual após reiniciar ainda precisa de confirmação específica |
| Criador de dunks e todos os tipos de animação | Não validados individualmente |
| Partidas entre amigos / multiplayer real | Não implementados ou comprovados |

Há esperas nas transições do MyCourt e na liberação do menu de modos. Elas ainda precisam ser medidas e corrigidas. Somente o pedido solo observado é tratado pelo protótipo; outros modos podem ser rejeitados.

## Como foi feito

A investigação usou [REA](https://github.com/morluto/rea), IDA e preparação do Ghidra. A análise nativa efetiva e os endereços usados pelos módulos vieram principalmente do IDA, combinados com observadores em tempo de execução e testes manuais no jogo. Não houve acesso ao código-fonte original ou ao backend oficial.

O trabalho seguiu este ciclo:

1. Localizar serviços, leitores de campos, mensagens de erro e máquinas de estado no executável.
2. Observar quais serviços o cliente realmente procura, sem publicar dados de sessão.
3. Capturar os pedidos localmente e recuperar o contrato binário/JSON esperado.
4. Implementar uma resposta pequena no servidor e testar formato, identidade e persistência.
5. Reabrir o cliente com os observadores e validar o comportamento na tela.

Alguns erros importantes ajudaram a separar hipóteses de resultados:

- O limite de 85 OVR dependia também do orçamento de upgrades; alterar apenas o cap exibido não bastava.
- Badges não podiam ser concedidas sem considerar o potencial de cada categoria da build.
- Os objetos de quadra, jogador e sala do 2K22 têm estruturas diferentes da referência 2K19. Os bitmaps recuperados têm 148, 165 e 30 campos, respectivamente.
- O tipo de quadra 31 concluía uma solicitação, mas era tratado pelo cliente no caminho de sofá. O tipo 33 permitiu iniciar a gameplay solo confirmada no MyCourt.
- Comprar animações exigiu anunciar a consulta de preços, receber uma proposta JSON comprimida com zlib, devolver instâncias de itens e implementar a consulta de inventário.
- O jump shot não chegava à gravação porque faltava a validação do nome. A captura real revelou UTF-16 com comprimento em bytes, diferente da suposição inicial do codec de referência.

## Arquitetura

- `server-lab/server.cjs`: HTTP/HTTPS local, sessões, captura, respostas e roteamento.
- `session-services.cjs`: manifesto de serviços anunciado ao cliente.
- `world-*.cjs`, `park-capture.cjs`: transporte WebSocket e bootstrap de um participante.
- `mycourt-*.cjs`: transferência de sala, propriedade, objetos e modo solo experimental.
- `attribute-*.cjs`, `item-prices.cjs`: preços e propostas de compra do laboratório.
- `item-inventory.cjs`: compras comuns/customizadas e arquivo local de inventário separado por conta e identificador de save recebido.
- `name-validation.cjs`: resposta local à validação dos nomes de criações.
- `redirect/`: fontes C++ do lançador, redirecionamento, observadores e ajustes de progressão.

O servidor escuta somente em `127.0.0.1`. A configuração de desenvolvimento utiliza HTTPS na porta **21022** e WebSocket na **21023**, subprotocolo `chat`. Há captura UDP, sem implementação de relay multiplayer.

As fontes publicadas usam caminhos configuráveis. O lançador carrega os módulos no processo do jogo; hooks e ajustes são feitos em memória. O executável original e o arquivo hosts não são modificados. Fechar o processo encerra os ajustes em memória.

## Dependências e limites da publicação

São publicados fontes e documentação. Não estão incluídos executáveis do jogo, instalador Aurora2K, saves, capturas reais, respostas com contas, sessões, tokens, certificados, chaves, bancos IDA/Ghidra, código descompilado completo ou dependências de terceiros.

Os codecs **Granite e Opal da referência 2K19** continuam externos. A origem disponível neste laboratório contém avisos **PolyForm Noncommercial 1.0.0**; obtenha a referência separadamente e observe a licença e a atribuição dela. Configurar uma dependência não concede direitos sobre o jogo ou sobre esses projetos.

Os hooks usam [MinHook](https://github.com/TsudaKageyu/minhook), que deve ser obtido separadamente e usado com sua licença. REA, IDA e Ghidra são ferramentas de análise; não são necessários para executar cada pedido do servidor.

Não foi escolhida uma licença geral para este repositório. Licenças das dependências permanecem independentes.

## Preparação

Requisitos: Windows x64 para o cliente/módulos, Node.js 20 ou superior, codecs externos, MinHook e compilador LLVM-MinGW x64 para reconstruir os módulos. Para HTTPS local, também é necessário OpenSSL ou um certificado PFX próprio do laboratório.

O executável estudado tem SHA-256:

```text
1727ad72085fba39e789ee574fc15aab623ad1651cf6879e95e8cd53b6ffbbf5
```

O script recusa outro hash. Os RVAs e prólogos dos hooks são específicos dessa versão; a adaptação de caminho não torna outras versões compatíveis.

Configure no PowerShell, ajustando os exemplos:

```powershell
$env:NBA2K22_EXE = 'D:\Games\NBA2K22\NBA2K22.exe'
$env:REFERENCE_ROOT = 'D:\References\2K19 Servers'
# Esperados dentro de REFERENCE_ROOT:
# Granite/Server/Source/Codec/FieldList.js
# Opal/Source/Codec/FieldList.js
cd server-lab
npm ci
npm test
```

Alternativamente, use `REFERENCE_CODEC` e `REFERENCE_OPAL_CODEC` com os caminhos completos de cada codec.

Compile os módulos a partir da raiz:

```powershell
.\scripts\Build-Native.ps1 -CompilerRoot 'D:\Tools\llvm-mingw\bin' -MinHookRoot 'D:\References\minhook'
```

Crie seu certificado local, sem reutilizar chaves de outra instalação:

```powershell
.\scripts\New-LabTls.ps1
```

Esse script exige `openssl` no PATH e escreve o PFX e a configuração privada dentro de `server-lab`, ignorados pelo Git. Ele não instala confiança global no Windows.

Inicie o servidor em um terminal e o cliente em outro, preservando as variáveis de ambiente necessárias nos dois:

```powershell
cd server-lab
npm start
```

```powershell
.\redirect\Start-Capture.ps1
```

O relógio do laboratório usa uma âncora histórica para os recursos de mapa estudados. Isso não altera o relógio do Windows.

## Testes e validação

`npm test` usa propostas e identidades sintéticas, portas temporárias e dados em diretório temporário. Verifica preços, validação de nomes, compra/inventário, persistência, isolamento e formato do handshake WebSocket. Não inclui as capturas privadas usadas durante a investigação.

Testes de protocolo não substituem o cliente real. A tabela de estado distingue implementação, testes automáticos e confirmação manual. Ainda faltam validação completa de persistência após reiniciar, criação de dunks, modos adicionais de MyCourt e multiplayer.

## Dados locais

O laboratório gera `captures/`, `responses/`, `sessions.json`, `item-inventory.json`, logs e outros arquivos privados. As capturas podem conter identificadores e conteúdo de sessão. Eles estão excluídos desta publicação e do `.gitignore`; **não os anexe a issues ou commits**. Para relatar falhas, compartilhe somente rota, tamanho, tipo, CRC, código de erro e passos de reprodução, sem valores privados.

## Próximos passos

- Confirmar recuperação das criações e animações depois de sair/entrar e reiniciar o jogo.
- Medir a espera de entrada/saída no MyCourt e corrigir a falha da primeira entrada.
- Validar individualmente dunks, dribles e outras criações.
- Implementar ciclo de partidas, replicação e testes com dois clientes antes de disponibilizar um servidor para amigos.

Este é um registro de pesquisa e um protótipo local, sem vínculo com 2K, Take-Two, NBA ou os autores das ferramentas utilizadas.
