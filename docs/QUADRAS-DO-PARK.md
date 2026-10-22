# Quadras do Park (Got Next) — engenharia reversa e implementação

Executável analisado: `NBA2K22.exe`, SHA-256 `1727ad72085fba39e789ee574fc15aab623ad1651cf6879e95e8cd53b6ffbbf5`, base `0x140000000`.
Análise estática feita com objdump + scripts próprios (`tools/re`), cruzando com a referência 2K19 (Opal) e com as evidências REA/IDA do projeto do Codex. Endereços são VA.

## 1. O que o cliente faz

A mecânica das quadras do Park no 2K22 é a mesma família da 2K19: o servidor publica objetos **COURT** e o cliente pede vaga pisando no tapete.

| Etapa | Onde no cliente | O que acontece |
| --- | --- | --- |
| Detecção da área | `GOTNEXT_AREA_DETECTOR::*` (`ai_world_area_detector_gotnext.vcc`) | Usa os retângulos de `GotNextSpotsSetup` do objeto COURT publicado pelo servidor |
| Pedido de vaga | `TK_WORLD::PARK_PLAYERMANAGER::UpdateParkState` `141741311..141742C1B` | Monta FieldList `COMMAND(0xB18F14CE)=JOIN(0x1EF43563)` + `AREA(0xE101D0DC)=índice do tapete` e envia ao *key* do objeto COURT (`14174209D`, `141741697`) |
| Resposta | mesmo estado | O cliente espera o próprio objeto PLAYER mudar `State` para `GOT_NEXT (0xCA9B2162)` com `CourtName` = `Name` da quadra |
| Sair | `141742412` | `COMMAND=LEAVE (0x6CE44260)` |
| Início | `PARK_PLAYERMANAGER::UpdateGameState` `141739266` | Com `State=PLAYING`, procura a quadra por `CourtName`; se `IsLockstep=1` exige **`ObjectState==2`** (`1417393C1`); lê `AwayTeam[5]`, `HomeTeam[5]`, `MatchId`, `Uuid`, `ByteMatchCode`, `RandomSeed`, `Address/Port/VPort`, contagens de time e cria a partida |
| Conectado | — | `COMMAND=READY (0xDFC1471F)` |
| Fim | `UpdateGameEnding` `14173836A` | `COMMAND=0xDAEAFE9E` com `RESULT` (`WON 0x7037DE7A` etc.) |

Estados do PLAYER (offset `+0x12C` do objeto, `+69` no corpo do handshake): `WALKING 0x9705BB0D`, `PENDING 0xEB9084A3`, `GOT_NEXT 0xCA9B2162`, `LIMBO 0xE1533AF7`, `PLAYING 0xECBCCDF8`. `CourtName` fica logo depois (`+0x134` / corpo `+73`).

Os nomes vieram de um dicionário CRC32 com todas as strings do executável (`tools/re/crcdict.py`), não de suposição: `JOIN`, `LEAVE`, `READY`, `AREA`, `WON`, `USERDATA`, `TKWORLD_SERVEROBJECT_COURT/PLAYER/SLOT/MYCOURT`, `WALKING`, `GOT_NEXT`, `PENDING`, `LIMBO`, `PLAYING`.

Também existe um caminho de **Slot** (`TKWORLD_SERVEROBJECT_SLOT 0x90ACAEE4`, `COMMAND=ACQUIRE 0xFE0CFC1C` / `0xA102FD07`) usado para assentos/filas especiais; não é necessário para o Got Next comum e não foi implementado.

## 2. Esquemas recuperados

Impressoras de campos sujos (`"{0} is Dirty"`) dão os nomes; leitores de flags e de valores dão os tamanhos. Valores são cópias cruas para structs nativas (little-endian).

**GAMEOBJECT base** — impressora `1416B8210`, valores `14164AD50` (20 bits):
`Name u32, IsActiveFlag u8, IsDestroyFlag u8, IsDummyObject u8, Transform 64B, Interaction 3×20B, ArtBinding u32, ObjectState u32, PacketId u8, IsLockstep u8, Uuid 16B, Address u32, Port u16, VPort u16, RandomSeed u64, MatchId u64, LastError u32, ByteMatchCode u32`.

**COURT** — impressora `1416B4EC0`, flags `141650420`, valores `141648030` (bits 20..147, total 148 — bate com a medição do Codex):

| bit | campo | tamanho |
| --- | --- | --- |
| 20 | CourtType | u32 |
| 21–27 | FlipDirectionOfPlay, IsHalfCourt, CurrentStreak(u16), HasWaitingArea, Lastscore(u16), Highscore(u16), HighscorePuid(u64) | |
| 28 | NumberOfAwayTeam | u8 |
| 29 | StartType | u32 |
| 30–34 | AwayTeam[5] | u64 |
| 35–49 | AwayTeamConfirmed[5] u8, AwayTeamPrepared[5] u8, AwayTeamResult[5] u32 | |
| 50–54 | AwayUserData[5] | u32 tamanho + zlib |
| 55 | NumberOfHomeTeam | u8 |
| 56–60 | HomeTeam[5] | u64 |
| 61–80 | HomeTeamPrepared, HomeTeamConfirmed, HomeTeamResult, HomeUserData | |
| 81 | GamePreparedValid | u8 |
| 82 | NumberOfGotNextSpots | u8 |
| 83–85 | GotNextSpots[3] | 0x48 |
| 86–88 | GotNextSpotsSetup[3] | 0x90 |
| 89–97 | Winner/Loser/Utility StartLocation(vec4), Offset(vec4), Facing(i32) | |
| 98–100 | HomeSpotCount, AwaySpotCount, UtilityPlayerCount | u8 |
| 101–124 | UtilityPlayerList[8] u8, UtilityPuidList[8] u64, UtilityMachineIdList[8] u64 | |
| 125–147 | EventPresentation … GameProgressAway[5] | |

Layout em memória relevante: `NumberOfGotNextSpots +0x30B`, `GotNextSpots +0x310`, `GotNextSpotsSetup +0x400`, `AwayTeam +0x1C8`, `HomeTeam +0x270`, `GamePreparedValid +0x309`.

Registro **GotNextSpotsSetup (0x90)** — consumidores confirmam `+0x60` cantos (`14169C539`), `+0x80` quantidade (`1416AF9C6`), `+0x84` flag, `+0x88` modo (`1416BFA16`); igual à 2K19:
`+0x00 base vec4, +0x10 passo vec4, +0x20 facing i32, +0x30 saída vec4, +0x40 passo, +0x50 facing, +0x60 4 cantos (x,z float), +0x80 count u32, +0x84 squad u8, +0x85 primeiro u8, +0x88 modo u32`.
Registro **GotNextSpots (0x48)** — ocupantes u64 a partir de `+0x08` (`1416BFA2C`), elegibilidade `+0x38`.

**Outros**: PLAYER `1416B9350` (131 nomes, inclui `State, CourtName, PlayGotNext, ServerDestination`), SLOT `1416BCE70` (`Name, NumberOfSpots, Spots`), MYCOURT `1416B8C50`.

## 3. Rede

- Movimento `0xCE1C9E8C` (30 bytes): `x,y,z` int16 BE em 16/18/20, direção u8 em 22 — confirmado numa captura real 2K22.
- USERDATA: `0x9E3471ED` com `COMMAND=USERDATA (0xCDBD175E)` e `COMPRESSED_DATA (0x970E50DF)` zlib (267 720 bytes inflados). Vai para `HomeUserData/AwayUserData`.
- Relay de jogo: o 2K22 contém os mesmos controles P2P do relay VCONLINE da 2K19 (`Leave 4149111C`, `Echo 41BF6BC3`, `Leader 5C85BD15`, `Connectivity 6E225397`). `Uuid` = token, `Address/Port` = relay, `VPort` = relay id.
- Presença: classe de posição `0x36BF2A26` e pacote `OBJECT_UPDATE_LIST 0x618EC78C` existem no executável.

## 4. O que foi implementado

| Arquivo | Função |
| --- | --- |
| `park-schema.cjs` | Esquemas base+COURT, codificador/decodificador do objeto |
| `park-courts.cjs` | Hub compartilhado: publica quadras, JOIN/LEAVE/READY/fim, início solo e lockstep, presença, calibração |
| `vconline-relay.cjs` | Relay UDP compatível (Connect/ConnectReply/dados roteados/Disconnect) |
| `world-capture-transport.cjs` | Painel `http://127.0.0.1:21023/park` e rotas `/park/*` (só local) |
| `park-capture.cjs` | Liga o hub em cada WebSocket do mundo; movimento não é mais gravado em disco |
| `friend-proxy.cjs` | Conector do amigo (TCP 21022/21023 e UDP 21023 → IP do host) |
| `park-courts-test.cjs`, `park-socket-test.cjs`, `vconline-relay-test.cjs` | Testes sintéticos e de integração |

Fluxo do servidor: handshake do jogador no Park → publica o PLAYER de volta, os outros jogadores (presença) e todas as quadras → JOIN coloca na fila (AREA 0 = casa, 1 = visitante; se cheia, vai para a outra) e muda o PLAYER para GOT_NEXT → quando as duas filas enchem: times, USERDATA, `MatchId`, `RandomSeed`, `Uuid`/relay, `IsLockstep=1`, `GamePreparedValid=1`, `ObjectState=2` e todos em PLAYING → todos READY (ou 10 s) → `ObjectState=3` → resultado ou desconexão encerra e volta todos para WALKING.

**Modo solo** (`soloStart`): com uma pessoa só no servidor, o JOIN inicia uma partida sem lockstep (`ObjectState=3`, igual ao que funcionou no MyCourt). Serve para validar a cadeia JOIN → GOT_NEXT → PLAYING com um cliente.

## 5. Limitações e o que ainda precisa de teste no jogo

- **Posições das quadras**: no desenho original elas vinham do servidor da 2K; os arquivos `*_markers.iff` instalados são stubs de 34 bytes. Por isso a calibração pelo painel (centro, cesta, casa, visitante) usando a posição real do jogador.
- **CourtType** padrão 4/5/6 (3v3/2v2/1v1) é herdado da 2K19 e configurável por quadra; precisa confirmação no 2K22.
- Formato do relay e presença foram confirmados por constantes presentes no executável, não por captura de partida 2K22. É o próximo ponto a observar.
- A escrita de `ServerDestination` (warp para o tapete) não foi implementada; o cliente tem o próprio warp de Got Next.
- Nada foi testado no jogo nesta etapa: os testes cobrem formato, estado e transporte.
