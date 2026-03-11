'use strict';

const config = require('../config.json');

/**
 * Validates an auth message from a connecting server.
 * Returns the server_id on success, or null on failure.
 *
 * Expected message shape:
 *   { type: "auth", server_id: "lobby", key: "supersecretkey" }
 */
function authenticate(msg) {
  if (!msg.server_id || !msg.key) return null;

  const expected = config.servers[msg.server_id];
  if (!expected) return null;

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(msg.key, expected)) return null;

  return msg.server_id;
}

/**
 * Constant-time string comparison so an attacker cannot
 * determine the correct key length via response timing.
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const { timingSafeEqual: cryptoEqual, createHash } = require('crypto');
  const bufA = createHash('sha256').update(a).digest();
  const bufB = createHash('sha256').update(b).digest();
  return cryptoEqual(bufA, bufB);
}

module.exports = { authenticate };
