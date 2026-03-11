'use strict';

const config = require('../config.json');

/**
 * Tracks in-flight RPC calls and handles timeouts.
 *
 * Flow:
 *   1. Caller sends { type: "rpc", id, to, payload }
 *   2. Hub registers the call here and forwards to target
 *   3. Target responds with { type: "rpc_response", id, payload }
 *   4. Hub resolves the call and routes response back to caller
 *   5. If no response within rpc_timeout_ms, an error is sent to caller
 */
class RPC {
  constructor() {
    // Map<id, { caller: Client, timeout: NodeJS.Timeout }>
    this._pending = new Map();
  }

  /**
   * Register an outgoing RPC call.
   * onTimeout is called with (id, caller) if no response arrives in time.
   */
  register(id, caller, onTimeout) {
    const timeout = setTimeout(() => {
      if (this._pending.has(id)) {
        this._pending.delete(id);
        onTimeout(id, caller);
      }
    }, config.rpc_timeout_ms);

    this._pending.set(id, { caller, timeout });
  }

  /**
   * Resolve a pending RPC call.
   * Returns the original caller Client, or null if not found.
   */
  resolve(id) {
    const entry = this._pending.get(id);
    if (!entry) return null;
    clearTimeout(entry.timeout);
    this._pending.delete(id);
    return entry.caller;
  }

  /**
   * Cancel all pending RPCs for a disconnected client.
   */
  cancelForClient(client) {
    for (const [id, entry] of this._pending) {
      if (entry.caller === client) {
        clearTimeout(entry.timeout);
        this._pending.delete(id);
      }
    }
  }
}

module.exports = RPC;
