// Emulator-only HTTP and TCP endpoints. Do not run against a real TV.
const http = require('http');
const net = require('net');
http.createServer((request, response) => {
  const body = request.url === '/query/device-info'
    ? '<device-info><serial-number>vpn-fixture</serial-number><user-device-name>VPN test TV</user-device-name><model-name>TV</model-name></device-info>'
    : request.url === '/query/media-player' ? '<player state="pause" />' : '<apps />';
  response.writeHead(200, { 'Content-Length': Buffer.byteLength(body), 'Content-Type': 'text/xml' });
  response.end(body);
}).listen(8060, '127.0.0.1');
net.createServer(socket => {
  socket.on('error', () => {});
  socket.pipe(socket);
}).listen(18061, '127.0.0.1');
console.log('TV network fixture listening on 8060 and 18061');
