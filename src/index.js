'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const Hub = require('./hub');

const config = require('../config.json');

const PORT = process.env.NHUB_PORT || config.port || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('nhub');
});

const wss = new WebSocketServer({ server });
const hub = new Hub();

wss.on('connection', (socket) => {
  hub.onConnection(socket);
});

server.listen(PORT, () => {
  console.log(`[nhub] listening on port ${PORT}`);
  console.log(`[nhub] ${Object.keys(config.servers).length} server(s) configured: ${Object.keys(config.servers).join(', ')}`);
});

process.on('SIGINT', () => {
  console.log('[nhub] shutting down');
  wss.close();
  server.close();
  process.exit(0);
});
