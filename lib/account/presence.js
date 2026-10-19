import dgram from 'node:dgram';

// Same fixed game endpoint as /api/server; never accept a target supplied by a visitor.
const HOST = '51.75.44.14', PORT = 2219;
export function clientNames(packet) {
  if (packet.length < 13) throw new Error('Truncated client list');
  const count = packet.readUInt16LE(11), names = []; let offset = 13;
  if (count > 100) throw new Error('Incomplete client list');
  for (let i = 0; i < count; i++) {
    if (offset >= packet.length) throw new Error('Truncated nickname');
    const length = packet[offset++];
    if (!length || length > 24 || offset + length + 4 > packet.length) throw new Error('Invalid nickname');
    names.push(packet.subarray(offset, offset + length).toString('utf8')); offset += length + 4;
  }
  if (offset !== packet.length) throw new Error('Unexpected client data');
  return names;
}
function queryClients() {
  return new Promise(resolve => {
    const socket = dgram.createSocket('udp4'); let finished = false;
    const finish = names => { if (finished) return; finished = true; clearTimeout(timeout); try { socket.close(); } catch {} resolve({ names, checkedAt: new Date().toISOString() }); };
    const timeout = setTimeout(() => finish(null), 1800);
    const packet = Buffer.alloc(11); packet.write('SAMP'); HOST.split('.').forEach((n, i) => { packet[4 + i] = Number(n); }); packet.writeUInt16LE(PORT, 8); packet[10] = 0x63;
    socket.on('error', () => finish(null));
    socket.on('message', (data, remote) => {
      if (remote.address !== HOST || remote.port !== PORT || data.length < 11 || !data.subarray(0, 11).equals(packet)) return;
      try { finish(clientNames(data)); } catch { finish(null); }
    });
    try { socket.send(packet, PORT, HOST, error => { if (error) finish(null); }); } catch { finish(null); }
  });
}
let cached, pending;
export async function presenceSnapshot({fresh=false}={}){
  if(fresh)return {...await queryClients(),source:'game-query'};
  if (!cached || Date.now() - cached.at > 15000) {
    pending ??= queryClients().then(value => { cached = { ...value, at: Date.now() }; return cached; }).finally(() => { pending = null; });
    await pending;
  }
  return {names:cached.names===null?null:[...cached.names],checkedAt:cached.checkedAt,source:'game-query'};
}
export async function presence(nickname, { fresh = false } = {}) {
  const result=await presenceSnapshot({fresh});
  return {online:result.names===null?null:result.names.some(name=>name.toLowerCase()===nickname.toLowerCase()),checkedAt:result.checkedAt,source:'game-query'};
}
