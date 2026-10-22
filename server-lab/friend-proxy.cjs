'use strict';
// Friend connector: run on the FRIEND's PC instead of the server.
//   node friend-proxy.cjs <host-ip>   (e.g. a Radmin VPN / ZeroTier / Tailscale / LAN address)
// The game (with the existing redirect module) keeps talking to 127.0.0.1;
// this forwards HTTPS 21022, world WebSocket 21023/TCP and relay 21023/UDP to
// the host, which must run the server with LISTEN_HOST=0.0.0.0.
const net = require('node:net'), dgram = require('node:dgram');
const host = process.argv[2] || process.env.HOST_IP;
if (!host || !net.isIP(host)) { console.error('Uso: node friend-proxy.cjs <ip-do-host>'); process.exit(2); }
const tcpPorts = [Number(process.env.PORT || 21022), 21023], udpPort = 21023;

for (const port of tcpPorts) {
  const server = net.createServer(local => {
    const remote = net.connect(port, host);
    local.pipe(remote); remote.pipe(local);
    const end = () => { local.destroy(); remote.destroy(); };
    local.on('error', end); remote.on('error', end); local.on('close', end); remote.on('close', end);
  });
  server.on('error', e => { console.error(`TCP ${port}: ${e.code || e.message} (o servidor local está aberto neste PC?)`); process.exit(1); });
  server.listen(port, '127.0.0.1', () => console.log(`TCP 127.0.0.1:${port} -> ${host}:${port}`));
}

const front = dgram.createSocket('udp4'), upstream = new Map();
front.on('message', (packet, client) => {
  const key = client.address + ':' + client.port;
  let link = upstream.get(key);
  if (!link) {
    const socket = dgram.createSocket('udp4');
    socket.on('message', reply => front.send(reply, client.port, client.address));
    socket.on('error', () => {});
    link = { socket, seen: Date.now() }; upstream.set(key, link);
  }
  link.seen = Date.now(); link.socket.send(packet, udpPort, host);
});
front.on('error', e => { console.error(`UDP ${udpPort}: ${e.code || e.message}`); process.exit(1); });
front.bind(udpPort, '127.0.0.1', () => console.log(`UDP 127.0.0.1:${udpPort} -> ${host}:${udpPort}`));
setInterval(() => { const old = Date.now() - 120000; for (const [k, l] of upstream) if (l.seen < old) { l.socket.close(); upstream.delete(k); } }, 30000).unref();
console.log('Conector de amigo ativo. Deixe esta janela aberta e inicie o jogo.');
