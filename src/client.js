'use strict';

/**
 * Represents an authenticated game server connected to nhub.
 */
class Client {
  constructor(serverId, socket) {
    this.serverId = serverId;
    this.socket = socket;
    this.channels = new Set();
    this.connectedAt = Date.now();
  }

  send(msg) {
    if (this.socket.readyState === this.socket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  subscribe(channel) {
    this.channels.add(channel);
  }

  unsubscribe(channel) {
    this.channels.delete(channel);
  }

  hasChannel(channel) {
    return this.channels.has(channel);
  }
}

module.exports = Client;
