const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const MAX_HISTORY = 50;
const MAX_MESSAGE_LENGTH = 500;

const app = express();
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    connectedClients: clients.size,
    rooms: Array.from(roomHistory.keys()),
  });
});

const server = http.createServer(app);
const wss = new WebSocket.WebSocketServer({ server });

/*
  clients: Map<WebSocket, { username: string, room: string }>
  roomHistory: Map<string, Array<{ type, username, text, timestamp }>>
*/
const clients = new Map();
const roomHistory = new Map();

function now() {
  return new Date().toISOString();
}

function safeSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function usernameTaken(username) {
  const wanted = username.trim().toLowerCase();
  for (const client of clients.values()) {
    if (client.username.toLowerCase() === wanted) {
      return true;
    }
  }
  return false;
}

function getRoomUsers(room) {
  return Array.from(clients.values())
    .filter((client) => client.room === room)
    .map((client) => client.username)
    .sort((a, b) => a.localeCompare(b));
}

function broadcastToRoom(room, payload, excludeWs = null) {
  for (const [ws, client] of clients.entries()) {
    if (client.room === room && ws !== excludeWs) {
      safeSend(ws, payload);
    }
  }
}

function sendUserList(room) {
  const users = getRoomUsers(room);
  broadcastToRoom(room, {
    type: "user_list",
    room,
    users,
  });
}

function addToHistory(room, message) {
  if (!roomHistory.has(room)) {
    roomHistory.set(room, []);
  }

  const history = roomHistory.get(room);
  history.push(message);

  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

function sendSystemMessage(room, text, excludeWs = null) {
  broadcastToRoom(
    room,
    {
      type: "system",
      text,
      timestamp: now(),
    },
    excludeWs
  );
}

function parseMessage(raw) {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

wss.on("connection", (ws) => {
  safeSend(ws, {
    type: "welcome",
    text: "Connected to server. Please join with a username and room.",
  });

  ws.on("message", (raw) => {
    const data = parseMessage(raw);

    if (!data || typeof data !== "object") {
      safeSend(ws, {
        type: "error",
        text: "Invalid JSON message.",
      });
      return;
    }

    const currentClient = clients.get(ws);

    if (data.type === "join") {
      const username = String(data.username || "").trim();
      const room = String(data.room || "general")
        .trim()
        .toLowerCase();

      if (!username) {
        safeSend(ws, {
          type: "error",
          text: "Username is required.",
        });
        return;
      }

      if (username.length > 20) {
        safeSend(ws, {
          type: "error",
          text: "Username must be 20 characters or fewer.",
        });
        return;
      }

      if (!room) {
        safeSend(ws, {
          type: "error",
          text: "Room is required.",
        });
        return;
      }

      if (currentClient) {
        safeSend(ws, {
          type: "error",
          text: "You already joined a room.",
        });
        return;
      }

      if (usernameTaken(username)) {
        safeSend(ws, {
          type: "error",
          text: "That username is already in use.",
        });
        return;
      }

      clients.set(ws, { username, room });

      if (!roomHistory.has(room)) {
        roomHistory.set(room, []);
      }

      safeSend(ws, {
        type: "joined",
        username,
        room,
        history: roomHistory.get(room),
      });

      sendSystemMessage(room, `${username} joined #${room}.`, ws);
      sendUserList(room);

      console.log(`[JOIN] ${username} joined #${room}`);
      return;
    }

    if (!currentClient) {
      safeSend(ws, {
        type: "error",
        text: "You must join before sending messages.",
      });
      return;
    }

    if (data.type === "chat") {
      const text = String(data.text || "").trim();

      if (!text) {
        return;
      }

      if (text.length > MAX_MESSAGE_LENGTH) {
        safeSend(ws, {
          type: "error",
          text: `Message is too long. Max ${MAX_MESSAGE_LENGTH} characters.`,
        });
        return;
      }

      const message = {
        type: "chat",
        username: currentClient.username,
        room: currentClient.room,
        text,
        timestamp: now(),
      };

      addToHistory(currentClient.room, message);
      broadcastToRoom(currentClient.room, message);
      return;
    }

    if (data.type === "typing") {
      broadcastToRoom(
        currentClient.room,
        {
          type: "typing",
          username: currentClient.username,
          isTyping: Boolean(data.isTyping),
        },
        ws
      );
      return;
    }

    safeSend(ws, {
      type: "error",
      text: "Unknown message type.",
    });
  });

  ws.on("close", () => {
    const client = clients.get(ws);
    if (!client) return;

    clients.delete(ws);
    sendSystemMessage(client.room, `${client.username} left #${client.room}.`);
    sendUserList(client.room);

    console.log(`[LEAVE] ${client.username} left #${client.room}`);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
