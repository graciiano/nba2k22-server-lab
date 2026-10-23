'use strict';
// Ponto de entrada só para captura: sobe o MESMO handler HTTP(S) do servidor (createLab) escutando no endereço e
// porta que o cliente da Steam usa (nba2k22-ws.2ksports.com:22004, redirecionado pelo hosts para 127.0.0.1), com o
// nosso certificado. Cada requisição que o jogo manda é gravada em captures\ (.bin + .json com os campos já
// decodificados); sem --experimental-login ele responde 501, então é observação pura do que o cliente novo pede.
// Env: CAPTURE_PFX (caminho do .pfx do host), CAPTURE_PFX_PASS (senha), PORT (padrão 22004), HOST (padrão 127.0.0.1).
const fs = require('node:fs');
const { createLab } = require('./server.cjs');
const pfxPath = process.env.CAPTURE_PFX;
if (!pfxPath || !fs.existsSync(pfxPath)) { console.error('Falta CAPTURE_PFX (certificado do host). Rode pelo Iniciar-Captura.ps1.'); process.exit(1); }
const tls = { pfx: fs.readFileSync(pfxPath), passphrase: process.env.CAPTURE_PFX_PASS || '' };
const port = Number(process.env.PORT || 22004);
const host = process.env.HOST || '127.0.0.1';
const server = createLab({ tls, experimentalLogin: process.argv.includes('--experimental-login') });
server.listen(port, host, () => console.log(`captura em https://nba2k22-ws.2ksports.com:${port} (${host}:${port}) — abra o jogo pela Steam. Ctrl+C encerra.`));
