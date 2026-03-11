'use strict';

/**
 * Manages channel subscriptions across all connected clients.
 * Channels are dynamic — no pre-registration needed.
 * Subscriptions reset when a client disconnects.
 */
class Channels {
  constructor() {
    // Map<channelName, Set<Client>>
    this._channels = new Map();
  }

  subscribe(client, channel) {
    if (!this._channels.has(channel)) {
      this._channels.set(channel, new Set());
    }
    this._channels.get(channel).add(client);
    client.subscribe(channel);
  }

  unsubscribe(client, channel) {
    const members = this._channels.get(channel);
    if (members) {
      members.delete(client);
      if (members.size === 0) this._channels.delete(channel);
    }
    client.unsubscribe(channel);
  }

  /**
   * Remove a client from all channels (called on disconnect).
   */
  removeClient(client) {
    for (const channel of client.channels) {
      const members = this._channels.get(channel);
      if (members) {
        members.delete(client);
        if (members.size === 0) this._channels.delete(channel);
      }
    }
    client.channels.clear();
  }

  /**
   * Returns all clients subscribed to a channel, excluding the sender.
   */
  getSubscribers(channel, excludeClient = null) {
    const members = this._channels.get(channel);
    if (!members) return [];
    return [...members].filter(c => c !== excludeClient);
  }
}

module.exports = Channels;
