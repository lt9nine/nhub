'use strict';

const { authenticate } = require('./auth');
const Client = require('./client');
const Channels = require('./channels');
const RPC = require('./rpc');

class Hub {
  constructor() {
    // Map<serverId, Client>
    this._clients = new Map();
    this._channels = new Channels();
    this._rpc = new RPC();
  }

  /**
   * Called when a new raw WebSocket connection is established.
   * The connection is not trusted until an auth message is received.
   */
  onConnection(socket) {
    let client = null;

    socket.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return this._reject(socket, 'invalid_json');
      }

      if (!client) {
        // First message must be auth
        if (msg.type !== 'auth') return this._reject(socket, 'auth_required');
        const serverId = authenticate(msg);
        if (!serverId) return this._reject(socket, 'auth_failed');

        // Disconnect existing session for this server if any
        if (this._clients.has(serverId)) {
          const existing = this._clients.get(serverId);
          this._removeClient(existing);
          existing.socket.terminate();
        }

        client = new Client(serverId, socket);
        this._clients.set(serverId, client);
        console.log(`[nhub] ${serverId} connected (${this._clients.size} servers online)`);
        client.send({ type: 'auth_ok', server_id: serverId });
        return;
      }

      this._handleMessage(client, msg);
    });

    socket.on('close', () => {
      if (client) {
        this._removeClient(client);
        console.log(`[nhub] ${client.serverId} disconnected (${this._clients.size} servers online)`);
      }
    });

    socket.on('error', (err) => {
      console.error(`[nhub] socket error${client ? ` (${client.serverId})` : ''}:`, err.message);
    });
  }

  _handleMessage(client, msg) {
    if (!msg.type) return;

    switch (msg.type) {
      case 'broadcast':
        return this._broadcast(client, msg);
      case 'direct':
        return this._direct(client, msg);
      case 'rpc':
        return this._rpcCall(client, msg);
      case 'rpc_response':
        return this._rpcResponse(client, msg);
      case 'subscribe':
        return this._subscribe(client, msg);
      case 'unsubscribe':
        return this._unsubscribe(client, msg);
      default:
        client.send({ type: 'error', code: 'unknown_type', ref: msg.type });
    }
  }

  /**
   * Broadcast to all authenticated servers, or to a channel if specified.
   */
  _broadcast(sender, msg) {
    const envelope = this._envelope(sender, msg);

    if (msg.channel) {
      const subscribers = this._channels.getSubscribers(msg.channel, sender);
      for (const client of subscribers) client.send(envelope);
    } else {
      for (const [, client] of this._clients) {
        if (client !== sender) client.send(envelope);
      }
    }
  }

  /**
   * Send directly to a specific server by server_id.
   */
  _direct(sender, msg) {
    if (!msg.to) return sender.send({ type: 'error', code: 'missing_to' });

    const target = this._clients.get(msg.to);
    if (!target) return sender.send({ type: 'error', code: 'target_not_found', target: msg.to });

    target.send(this._envelope(sender, msg));
  }

  /**
   * RPC call: route to target and register timeout.
   */
  _rpcCall(sender, msg) {
    if (!msg.to) return sender.send({ type: 'error', code: 'missing_to' });
    if (!msg.id) return sender.send({ type: 'error', code: 'missing_id' });

    const target = this._clients.get(msg.to);
    if (!target) return sender.send({ type: 'error', code: 'target_not_found', target: msg.to });

    this._rpc.register(msg.id, sender, (id, caller) => {
      caller.send({ type: 'rpc_timeout', id });
    });

    target.send(this._envelope(sender, msg));
  }

  /**
   * RPC response: route back to the original caller.
   */
  _rpcResponse(sender, msg) {
    if (!msg.id) return sender.send({ type: 'error', code: 'missing_id' });

    const caller = this._rpc.resolve(msg.id);
    if (!caller) return; // timed out or unknown id — silently drop

    caller.send(this._envelope(sender, msg));
  }

  _subscribe(client, msg) {
    if (!msg.channel) return client.send({ type: 'error', code: 'missing_channel' });
    this._channels.subscribe(client, msg.channel);
    client.send({ type: 'subscribed', channel: msg.channel });
  }

  _unsubscribe(client, msg) {
    if (!msg.channel) return client.send({ type: 'error', code: 'missing_channel' });
    this._channels.unsubscribe(client, msg.channel);
    client.send({ type: 'unsubscribed', channel: msg.channel });
  }

  _removeClient(client) {
    this._clients.delete(client.serverId);
    this._channels.removeClient(client);
    this._rpc.cancelForClient(client);
  }

  _reject(socket, reason) {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: 'error', code: reason }));
      socket.terminate();
    }
  }

  /**
   * Build the outgoing message envelope, stamping from/channel.
   */
  _envelope(sender, msg) {
    return {
      type: msg.type,
      id: msg.id || null,
      from: sender.serverId,
      to: msg.to || null,
      channel: msg.channel || null,
      payload: msg.payload || null,
      ts: Date.now(),
    };
  }
}

module.exports = Hub;
