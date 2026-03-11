'use strict';

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'config.json');
const file = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// --- Simple overrides ---
if (process.env.NHUB_PORT)        file.port           = parseInt(process.env.NHUB_PORT, 10);
if (process.env.NHUB_RPC_TIMEOUT) file.rpc_timeout_ms = parseInt(process.env.NHUB_RPC_TIMEOUT, 10);

// --- Server list override ---
// Format: "lobby:secret1,survival:secret2"
// Colons inside a key are allowed: split on first colon only.
if (process.env.NHUB_SERVERS) {
  file.servers = {};
  for (const entry of process.env.NHUB_SERVERS.split(',')) {
    const colon = entry.indexOf(':');
    if (colon === -1) continue;
    const id  = entry.slice(0, colon).trim();
    const key = entry.slice(colon + 1).trim();
    if (id && key) file.servers[id] = key;
  }
}

module.exports = file;
