const joinPanel = document.getElementById("joinPanel");
const chatPanel = document.getElementById("chatPanel");

const joinForm = document.getElementById("joinForm");
const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("room");
const statusText = document.getElementById("statusText");

const roomLabel = document.getElementById("roomLabel");
const youLabel = document.getElementById("youLabel");
const headerRoom = document.getElementById("headerRoom");
const headerStatus = document.getElementById("headerStatus");
const usersList = document.getElementById("usersList");
const messages = document.getElementById("messages");
const typingIndicator = document.getElementById("typingIndicator");

const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const leaveBtn = document.getElementById("leaveBtn");

let socket = null;
let currentUsername = "";
let currentRoom = "";
let typingUsers = new Set();
let typingTimer = null;
let joined = false;

function setStatus(text) {
  statusText.textContent = text;
  headerStatus.textContent = text;
}

function escapeRoomName(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function connect(username, room) {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${protocol}://${location.host}`;

  socket = new WebSocket(wsUrl);
  setStatus("Connecting...");

  socket.addEventListener("open", () => {
    setStatus("Connected");
    socket.send(
      JSON.stringify({
        type: "join",
        username,
        room,
      })
    );
  });

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "welcome") {
      return;
    }

    if (data.type === "error") {
      alert(data.text);
      if (!joined && socket) {
        socket.close();
      }
      return;
    }

    if (data.type === "joined") {
      joined = true;
      currentUsername = data.username;
      currentRoom = data.room;

      roomLabel.textContent = `#${currentRoom}`;
      headerRoom.textContent = `#${currentRoom}`;
      youLabel.textContent = currentUsername;

      joinPanel.classList.add("hidden");
      chatPanel.classList.remove("hidden");

      messages.innerHTML = "";
      typingUsers = new Set();
      updateTypingIndicator();

      data.history.forEach(renderChatMessage);
      renderSystemMessage(`You joined #${currentRoom}.`);

      messageInput.focus();
      return;
    }

    if (data.type === "chat") {
      renderChatMessage(data);
      return;
    }

    if (data.type === "system") {
      renderSystemMessage(data.text);
      return;
    }

    if (data.type === "user_list") {
      renderUserList(data.users);
      return;
    }

    if (data.type === "typing") {
      if (data.username === currentUsername) return;

      if (data.isTyping) {
        typingUsers.add(data.username);
      } else {
        typingUsers.delete(data.username);
      }

      updateTypingIndicator();
    }
  });

  socket.addEventListener("close", () => {
    setStatus("Disconnected");
    if (joined) {
      renderSystemMessage("Disconnected from server.");
    }
    joined = false;
  });

  socket.addEventListener("error", () => {
    setStatus("Connection error");
  });
}

function renderUserList(users) {
  usersList.innerHTML = "";

  users.forEach((user) => {
    const li = document.createElement("li");
    li.textContent = user;
    usersList.appendChild(li);
  });
}

function renderSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "system-message";
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function renderChatMessage(message) {
  const wrapper = document.createElement("div");
  wrapper.className = "message";
  if (message.username === currentUsername) {
    wrapper.classList.add("self");
  }

  const header = document.createElement("div");
  header.className = "message-header";

  const name = document.createElement("span");
  name.className = "message-name";
  name.textContent = message.username;

  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const text = document.createElement("div");
  text.className = "message-text";
  text.textContent = message.text;

  header.appendChild(name);
  header.appendChild(time);

  wrapper.appendChild(header);
  wrapper.appendChild(text);

  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

function updateTypingIndicator() {
  if (typingUsers.size === 0) {
    typingIndicator.textContent = "";
    return;
  }

  const names = Array.from(typingUsers);
  if (names.length === 1) {
    typingIndicator.textContent = `${names[0]} is typing...`;
    return;
  }

  typingIndicator.textContent = `${names.join(", ")} are typing...`;
}

function sendTyping(isTyping) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !joined) return;

  socket.send(
    JSON.stringify({
      type: "typing",
      isTyping,
    })
  );
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const room = escapeRoomName(roomInput.value || "general");

  if (!username || !room) return;
  if (socket && socket.readyState === WebSocket.OPEN) return;

  connect(username, room);
});

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();
  if (!text) return;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  socket.send(
    JSON.stringify({
      type: "chat",
      text,
    })
  );

  messageInput.value = "";
  sendTyping(false);
});

messageInput.addEventListener("input", () => {
  if (!joined) return;

  const hasText = messageInput.value.trim().length > 0;
  sendTyping(hasText);

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    sendTyping(false);
  }, 800);
});

messageInput.addEventListener("blur", () => {
  sendTyping(false);
});

leaveBtn.addEventListener("click", () => {
  if (socket) {
    socket.close();
  }

  joined = false;
  currentUsername = "";
  currentRoom = "";
  typingUsers = new Set();

  usersList.innerHTML = "";
  messages.innerHTML = "";
  updateTypingIndicator();

  chatPanel.classList.add("hidden");
  joinPanel.classList.remove("hidden");
  setStatus("Disconnected");
});
