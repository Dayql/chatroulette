// ─── State ───
let token = localStorage.getItem("token");
let username = localStorage.getItem("username");
let socket = null;
let currentState = "initial"; // initial, waiting, matched, disconnected
let sendCooldown = false;
let typingTimeout = null;
let isTyping = false;
let nextCooldownTimer = null;

// ─── Init ───
if (token && username) {
  showChatScreen();
  connectWebSocket();
}

// ═══════════════════════════════════
// AUTH (API REST)
// ═══════════════════════════════════

function toggleAuth(mode) {
  document.getElementById("login-form").style.display = mode === "login" ? "block" : "none";
  document.getElementById("signup-form").style.display = mode === "signup" ? "block" : "none";
  hideError();
}

function showError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.style.display = "block";
}

function hideError() {
  document.getElementById("auth-error").style.display = "none";
}

async function handleSignup() {
  const btn = document.getElementById("signup-btn");
  btn.disabled = true;
  hideError();

  const body = {
    username: document.getElementById("signup-username").value.trim(),
    email: document.getElementById("signup-email").value.trim(),
    password: document.getElementById("signup-password").value,
  };

  try {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error.message);
      return;
    }

    token = data.token;
    username = data.user.username;
    localStorage.setItem("token", token);
    localStorage.setItem("username", username);
    showChatScreen();
    connectWebSocket();
  } catch {
    showError("Erreur réseau");
  } finally {
    btn.disabled = false;
  }
}

async function handleLogin() {
  const btn = document.getElementById("login-btn");
  btn.disabled = true;
  hideError();

  const body = {
    email: document.getElementById("login-email").value.trim(),
    password: document.getElementById("login-password").value,
  };

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error.message);
      return;
    }

    token = data.token;
    username = data.user.username;
    localStorage.setItem("token", token);
    localStorage.setItem("username", username);
    showChatScreen();
    connectWebSocket();
  } catch {
    showError("Erreur réseau");
  } finally {
    btn.disabled = false;
  }
}

async function handleLogout() {
  try {
    await fetch("/api/auth/logout", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* ignore */ }

  if (socket) socket.disconnect();
  if (typingTimeout) clearTimeout(typingTimeout);
  if (nextCooldownTimer) clearInterval(nextCooldownTimer);
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  token = null;
  username = null;
  location.reload();
}

// ═══════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════

function connectWebSocket() {
  socket = io({ auth: { token } });

  // ─── Connexion / déconnexion ───
  socket.on("connect", () => {
    document.getElementById("connection-banner").style.display = "none";
    setState("initial");
  });

  socket.on("disconnect", () => {
    document.getElementById("connection-banner").style.display = "block";
    setTypingIndicator("");
    stopTyping();
  });

  socket.on("connect_error", (err) => {
    if (err.message.includes("Unauthorized")) {
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      location.reload();
    }
  });

  // ─── Events serveur → client ───
  socket.on("waiting", () => {
    setState("waiting");
  });

  socket.on("matched", ({ partnerUsername, history = [] }) => {
    setState("matched", partnerUsername);
    renderHistory(history);
  });

  socket.on("message", ({ from, content, timestamp }) => {
    addMessage(from, content, timestamp, false);
  });

  socket.on("partnerDisconnected", () => {
    addSystemMessage("Votre partenaire s'est déconnecté");
    setTypingIndicator("");
    setState("disconnected");
  });

  socket.on("typing", ({ username: typingUsername, isTyping: typingState }) => {
    if (typingState) {
      setTypingIndicator(`${typingUsername} est en train d'écrire...`);
      return;
    }
    setTypingIndicator("");
  });

  socket.on("error", ({ code, message, retryAfterMs }) => {
    if (code === "NEXT_RATE_LIMIT") {
      addSystemMessage("Anti-spam: trop de 'suivant' en peu de temps.");
      startNextCooldown(retryAfterMs);
      return;
    }
    addSystemMessage("Erreur : " + message);
  });
}

// ─── Events client → serveur ───
function findPartner() {
  if (!socket || !socket.connected) return;
  socket.emit("findPartner", {});
}

function nextPartner() {
  if (!socket || !socket.connected) return;
  if (nextCooldownTimer) return;
  socket.emit("next", {});
}

function sendMessage() {
  if (!socket || !socket.connected) return;
  const input = document.getElementById("msg-input");
  const content = input.value.trim();
  if (!content || sendCooldown || currentState !== "matched") return;

  const btn = document.getElementById("btn-send");
  btn.disabled = true;
  sendCooldown = true;

  socket.emit("sendMessage", { content });
  stopTyping();
  addMessage(username, content, new Date().toISOString(), true);
  input.value = "";
  updateCharCount();

  // Rate limit front : 200ms entre chaque message
  setTimeout(() => {
    sendCooldown = false;
    btn.disabled = false;
  }, 200);
}

// ═══════════════════════════════════
// UI
// ═══════════════════════════════════

function showChatScreen() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("chat-screen").style.display = "flex";
  document.getElementById("display-username").textContent = username;
}

function setState(state, partnerUsername) {
  currentState = state;
  const title = document.getElementById("status-title");
  const subtitle = document.getElementById("status-subtitle");
  const spinner = document.getElementById("spinner");
  const btnFind = document.getElementById("btn-find");
  const btnNext = document.getElementById("btn-next");
  const chat = document.getElementById("chat-container");
  const input = document.getElementById("msg-input");

  // Reset
  spinner.style.display = "none";
  btnFind.style.display = "none";
  btnNext.style.display = "none";
  chat.style.display = "none";
  setTypingIndicator("");
  stopTyping();
  input.disabled = state !== "matched";

  switch (state) {
    case "initial":
      title.textContent = "Prêt à discuter ?";
      subtitle.textContent = "Trouvez un partenaire aléatoire";
      btnFind.style.display = "inline-block";
      break;

    case "waiting":
      title.textContent = "Recherche en cours...";
      subtitle.textContent = "En attente d'un partenaire";
      spinner.style.display = "block";
      break;

    case "matched":
      title.textContent = "Connecté avec";
      subtitle.innerHTML = `<span class="partner-name">${partnerUsername}</span>`;
      btnNext.style.display = "inline-block";
      btnNext.textContent = "Suivant";
      btnNext.disabled = false;
      chat.style.display = "flex";
      clearMessages();
      addSystemMessage(`Vous êtes connecté avec ${partnerUsername}`);
      document.getElementById("msg-input").focus();
      if (nextCooldownTimer) {
        document.getElementById("btn-next").disabled = true;
      }
      break;

    case "disconnected":
      title.textContent = "Partenaire déconnecté";
      subtitle.textContent = "Cherchez quelqu'un d'autre !";
      btnFind.style.display = "inline-block";
      btnFind.textContent = "Chercher un partenaire";
      break;
  }
}

function addMessage(from, content, timestamp, mine) {
  const container = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = `message ${mine ? "mine" : "theirs"}`;

  const time = new Date(timestamp).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  div.innerHTML = `
    ${!mine ? `<strong>${from}</strong><br>` : ""}
    ${escapeHtml(content)}
    <div class="meta">${time}</div>
  `;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addSystemMessage(text) {
  const container = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = "message system";
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function clearMessages() {
  document.getElementById("messages").innerHTML = "";
}

function renderHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return;
  addSystemMessage("Historique de la session");
  for (const msg of history) {
    const mine = msg.from === username;
    addMessage(msg.from, msg.content, msg.timestamp, mine);
  }
}

function setTypingIndicator(text) {
  document.getElementById("typing-indicator").textContent = text;
}

function stopTyping() {
  const shouldNotify = Boolean(socket && socket.connected && isTyping);
  isTyping = false;
  if (shouldNotify) {
    socket.emit("typing", { isTyping: false });
  }
}

function handleMessageInput() {
  updateCharCount();

  if (!socket || !socket.connected || currentState !== "matched") return;
  if (!isTyping) {
    isTyping = true;
    socket.emit("typing", { isTyping: true });
  }

  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    stopTyping();
  }, 800);
}

function startNextCooldown(retryAfterMs = 5000) {
  const btnNext = document.getElementById("btn-next");
  let remainingSeconds = Math.ceil(retryAfterMs / 1000);

  btnNext.disabled = true;
  btnNext.style.display = "inline-block";
  btnNext.textContent = `Suivant (${remainingSeconds}s)`;

  if (nextCooldownTimer) clearInterval(nextCooldownTimer);
  nextCooldownTimer = setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      clearInterval(nextCooldownTimer);
      nextCooldownTimer = null;
      btnNext.textContent = "Suivant";
      btnNext.disabled = currentState !== "matched";
      return;
    }
    btnNext.textContent = `Suivant (${remainingSeconds}s)`;
  }, 1000);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Compteur de caractères
document.getElementById("msg-input").addEventListener("input", handleMessageInput);
function updateCharCount() {
  const input = document.getElementById("msg-input");
  const count = document.getElementById("char-count");
  const len = input.value.length;
  count.textContent = `${len} / 500`;
  count.className = len > 450 ? "char-count warning" : "char-count";
}
