import { waitingQueue, activePairs } from "../state.js";
import { wsAuthMiddleware } from "../middleware/auth.js";

const pairRooms = new Map(); // socket.id -> roomId
const sessionHistory = new Map(); // roomId -> [{ from, content, timestamp }]
const nextRequests = new Map(); // socket.id -> number[] (timestamps)

const MAX_HISTORY_MESSAGES = 20;
const NEXT_LIMIT = 5;
const NEXT_WINDOW_MS = 60_000;

function buildRoomId(socketAId, socketBId) {
  return ["pair", socketAId, socketBId].sort().join(":");
}

function getRemainingCooldownMs(socketId) {
  const now = Date.now();
  const timestamps = nextRequests.get(socketId) || [];
  const recent = timestamps.filter((ts) => now - ts < NEXT_WINDOW_MS);
  nextRequests.set(socketId, recent);

  if (recent.length < NEXT_LIMIT) return 0;
  return Math.max(0, NEXT_WINDOW_MS - (now - recent[0]));
}

function registerNextRequest(socketId) {
  const now = Date.now();
  const timestamps = nextRequests.get(socketId) || [];
  const recent = timestamps.filter((ts) => now - ts < NEXT_WINDOW_MS);
  recent.push(now);
  nextRequests.set(socketId, recent);
}

// Tente de matcher deux users
function tryMatch(io, socket) {
  // Retirer de la queue si déjà présent
  const selfIndex = waitingQueue.indexOf(socket.id);
  if (selfIndex !== -1) waitingQueue.splice(selfIndex, 1);

  while (waitingQueue.length > 0) {
    const partnerId = waitingQueue.shift();
    const partnerSocket = io.sockets.sockets.get(partnerId);

    // Si le partenaire est déconnecté, passer au suivant
    if (!partnerSocket || !partnerSocket.connected) continue;

    // Créer la paire
    activePairs.set(socket.id, partnerId);
    activePairs.set(partnerId, socket.id);

    const roomId = buildRoomId(socket.id, partnerId);
    pairRooms.set(socket.id, roomId);
    pairRooms.set(partnerId, roomId);
    socket.join(roomId);
    partnerSocket.join(roomId);

    const history = sessionHistory.get(roomId) || [];
    socket.emit("matched", {
      partnerUsername: partnerSocket.user.username,
      history,
    });
    partnerSocket.emit("matched", {
      partnerUsername: socket.user.username,
      history,
    });
    return;
  }

  // Personne dispo → file d'attente
  waitingQueue.push(socket.id);
  socket.emit("waiting", {});
}

// Nettoie quand un user part
function cleanup(io, socket) {
  // Retirer de la queue
  const queueIndex = waitingQueue.indexOf(socket.id);
  if (queueIndex !== -1) waitingQueue.splice(queueIndex, 1);

  // Notifier le partenaire
  const partnerId = activePairs.get(socket.id);
  if (partnerId) {
    const roomId = pairRooms.get(socket.id);
    if (roomId) {
      socket.leave(roomId);
      sessionHistory.delete(roomId);
    }

    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) {
      if (roomId) partnerSocket.leave(roomId);
      pairRooms.delete(partnerId);
      partnerSocket.emit("partnerDisconnected", {});
    }
    activePairs.delete(partnerId);
    activePairs.delete(socket.id);
  }
  pairRooms.delete(socket.id);
}

export function registerHandlers(io) {
  io.use(wsAuthMiddleware);

  io.on("connection", (socket) => {
    console.log(`Connected: ${socket.user.username} (${socket.id})`);

    // ─── Event: chercher un partenaire ───
    socket.on("findPartner", () => {
      if (waitingQueue.includes(socket.id)) return;
      if (activePairs.has(socket.id)) return;
      tryMatch(io, socket);
    });

    // ─── Event: envoyer un message ───
    socket.on("sendMessage", ({ content } = {}) => {
      if (!content || content.trim() === "") {
        return socket.emit("error", {
          code: "EMPTY_MESSAGE",
          message: "Le message ne peut pas être vide",
        });
      }
      if (content.length > 500) {
        return socket.emit("error", {
          code: "MSG_TOO_LONG",
          message: "Le message ne doit pas dépasser 500 caractères",
        });
      }

      const partnerId = activePairs.get(socket.id);
      if (!partnerId) {
        return socket.emit("error", {
          code: "NO_PARTNER",
          message: "Vous n'êtes connecté à personne",
        });
      }

      const roomId = pairRooms.get(socket.id);
      const trimmedContent = content.trim();
      const messagePayload = {
        from: socket.user.username,
        content: trimmedContent,
        timestamp: new Date().toISOString(),
      };

      if (roomId) {
        const history = sessionHistory.get(roomId) || [];
        history.push(messagePayload);
        sessionHistory.set(roomId, history.slice(-MAX_HISTORY_MESSAGES));
        socket.to(roomId).emit("message", messagePayload);
      }
    });

    // ─── Event: indicateur de frappe ───
    socket.on("typing", ({ isTyping } = {}) => {
      if (typeof isTyping !== "boolean") return;
      const roomId = pairRooms.get(socket.id);
      if (!roomId) return;
      socket.to(roomId).emit("typing", {
        username: socket.user.username,
        isTyping,
      });
    });

    // ─── Event: passer au suivant ───
    socket.on("next", () => {
      const remainingMs = getRemainingCooldownMs(socket.id);
      if (remainingMs > 0) {
        return socket.emit("error", {
          code: "NEXT_RATE_LIMIT",
          message: "Trop de passages au suivant. Réessayez dans quelques secondes.",
          retryAfterMs: remainingMs,
        });
      }

      registerNextRequest(socket.id);
      cleanup(io, socket);
      tryMatch(io, socket);
    });

    // ─── Déconnexion ───
    socket.on("disconnect", () => {
      console.log(`Disconnected: ${socket.user.username} (${socket.id})`);
      nextRequests.delete(socket.id);
      cleanup(io, socket);
    });
  });
}
