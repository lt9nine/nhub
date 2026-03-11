# nhub

A lightweight WebSocket hub for multi-server game server architectures.
Enables global chat, server-to-server messaging, and RPC communication across game servers.

Built with AI!

- Single external dependency (`ws`)
- JSON message transport
- Designed to run as a Pterodactyl egg

---

## Table of Contents

- [Setup](#setup)
- [Configuration](#configuration)
- [Running](#running)
- [Security Model](#security-model)
- [Protocol](#protocol)
  - [Authentication](#authentication)
  - [Broadcast](#broadcast)
  - [Channel Broadcast](#channel-broadcast)
  - [Direct](#direct)
  - [RPC](#rpc)
  - [Subscribe / Unsubscribe](#subscribe--unsubscribe)
  - [Error Messages](#error-messages)
- [Message Reference](#message-reference)

---

## Setup

```bash
npm install
```

## Configuration

Edit `config.json` before starting:

```json
{
  "port": 8080,
  "rpc_timeout_ms": 5000,
  "servers": {
    "lobby": "your-lobby-secret",
    "survival": "your-survival-secret"
  }
}
```

| Key              | Description                                          |
|------------------|------------------------------------------------------|
| `port`           | Port nhub listens on (overridable via `NHUB_PORT`)   |
| `rpc_timeout_ms` | How long to wait for an RPC response before timeout  |
| `servers`        | Map of `server_id` → `api_key` for authentication   |

The port can also be set via environment variable, which takes priority over `config.json`:

```bash
NHUB_PORT=9090 npm start
```

## Running

```bash
npm start
```

---

## Security Model

nhub uses a **pre-shared API key per server**, validated once on WebSocket connection.
After a successful auth handshake, the connection is trusted for its lifetime.

> **The game server is responsible for not blindly forwarding raw player input to nhub.**
> nhub trusts the game server, not the player.

Players never interact with nhub directly. The WebSocket connection is strictly between
the game server process (via Lua scripts) and nhub. It is the game server's responsibility
to validate, sanitize, and authorize any player-triggered action before forwarding it to nhub.

### Security layers

| Layer          | Responsibility                                           |
|----------------|----------------------------------------------------------|
| TLS            | Reverse proxy (nginx/Caddy) — encrypts the connection    |
| Authentication | Pre-shared API key on connect — proves server identity   |
| Authorization  | Game server — validates player actions before forwarding |

---

## Protocol

All messages are JSON objects. Every message sent **to** nhub follows this shape:

```json
{
  "type": "...",
  "id": "optional-unique-id",
  "to": "target-server-id",
  "channel": "channel-name",
  "payload": {}
}
```

Every message received **from** nhub is stamped with:

```json
{
  "type": "...",
  "id": "...",
  "from": "originating-server-id",
  "to": "...",
  "channel": "...",
  "payload": {},
  "ts": 1741650000000
}
```

---

### Authentication

Must be the **first message** sent after connecting. The connection is closed immediately if any other message type is sent first, or if the key is wrong.

**Send:**
```json
{
  "type": "auth",
  "server_id": "lobby",
  "key": "your-lobby-secret"
}
```

**Response on success:**
```json
{
  "type": "auth_ok",
  "server_id": "lobby"
}
```

**Response on failure:** connection is terminated with an error message.

---

### Broadcast

Send a message to **all connected servers** except yourself.

**Send:**
```json
{
  "type": "broadcast",
  "payload": { "message": "Hello from lobby!" }
}
```

All other authenticated servers receive:
```json
{
  "type": "broadcast",
  "from": "lobby",
  "to": null,
  "channel": null,
  "payload": { "message": "Hello from lobby!" },
  "ts": 1741650000000
}
```

---

### Channel Broadcast

Send a message to all servers **subscribed to a channel**. Servers must subscribe first (see [Subscribe](#subscribe--unsubscribe)).

**Send:**
```json
{
  "type": "broadcast",
  "channel": "global-chat",
  "payload": { "player": "Steve", "message": "Hello!" }
}
```

Only servers subscribed to `global-chat` receive it (excluding the sender).

---

### Direct

Send a message to **one specific server** by its `server_id`.

**Send:**
```json
{
  "type": "direct",
  "to": "survival",
  "payload": { "command": "announce", "text": "Lobby is restarting" }
}
```

The target server receives:
```json
{
  "type": "direct",
  "from": "lobby",
  "to": "survival",
  "payload": { "command": "announce", "text": "Lobby is restarting" },
  "ts": 1741650000000
}
```

---

### RPC

Call a procedure on another server and receive a response. The `id` field ties the request to its response.

**Caller sends:**
```json
{
  "type": "rpc",
  "id": "req-001",
  "to": "survival",
  "payload": { "method": "getPlayerCount" }
}
```

**Target receives and must respond:**
```json
{
  "type": "rpc_response",
  "id": "req-001",
  "payload": { "count": 42 }
}
```

**Caller receives the response:**
```json
{
  "type": "rpc_response",
  "id": "req-001",
  "from": "survival",
  "payload": { "count": 42 },
  "ts": 1741650000000
}
```

If the target does not respond within `rpc_timeout_ms`, the caller receives:
```json
{
  "type": "rpc_timeout",
  "id": "req-001"
}
```

---

### Subscribe / Unsubscribe

Subscribe or unsubscribe from a named channel. Subscriptions are in-memory only and reset on reconnect.

**Subscribe:**
```json
{ "type": "subscribe", "channel": "global-chat" }
```
```json
{ "type": "subscribed", "channel": "global-chat" }
```

**Unsubscribe:**
```json
{ "type": "unsubscribe", "channel": "global-chat" }
```
```json
{ "type": "unsubscribed", "channel": "global-chat" }
```

Channels are dynamic — no pre-registration needed.

---

### Error Messages

nhub may send the following errors:

| `code`              | Cause                                                 |
|---------------------|-------------------------------------------------------|
| `invalid_json`      | Message could not be parsed as JSON                   |
| `auth_required`     | First message was not `auth`                          |
| `auth_failed`       | `server_id` not found or key mismatch                 |
| `unknown_type`      | Unrecognised message `type`                           |
| `missing_to`        | `direct` or `rpc` sent without a `to` field           |
| `missing_id`        | `rpc` or `rpc_response` sent without an `id` field    |
| `missing_channel`   | `subscribe`/`unsubscribe` sent without `channel`      |
| `target_not_found`  | `to` server is not connected                          |

```json
{ "type": "error", "code": "target_not_found", "target": "survival" }
```

---

## Message Reference

| Type            | Direction        | Description                                 |
|-----------------|------------------|---------------------------------------------|
| `auth`          | client → nhub    | Authenticate with server_id and key         |
| `auth_ok`       | nhub → client    | Auth accepted                               |
| `broadcast`     | client → nhub    | Send to all servers or a channel            |
| `direct`        | client → nhub    | Send to one server                          |
| `rpc`           | client → nhub    | Call a procedure on another server          |
| `rpc_response`  | client → nhub    | Respond to an RPC call                      |
| `rpc_timeout`   | nhub → client    | RPC call expired with no response           |
| `subscribe`     | client → nhub    | Subscribe to a channel                      |
| `subscribed`    | nhub → client    | Subscription confirmed                      |
| `unsubscribe`   | client → nhub    | Unsubscribe from a channel                  |
| `unsubscribed`  | nhub → client    | Unsubscription confirmed                    |
| `error`         | nhub → client    | Something went wrong (see `code`)           |
