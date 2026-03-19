import { waitingQueue, activePairs } from "../state.js";
import { wsAuthMiddleware } from "../middleware/auth.js";

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

    socket.emit("matched", { partnerUsername: partnerSocket.user.username });
    partnerSocket.emit("matched", { partnerUsername: socket.user.username });
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
    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) {
      partnerSocket.emit("partnerDisconnected", {});
    }
    activePairs.delete(partnerId);
    activePairs.delete(socket.id);
  }
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
    socket.on("sendMessage", ({ content }) => {
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

      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit("message", {
          from: socket.user.username,
          content: content.trim(),
          timestamp: new Date().toISOString(),
        });
      }
    });

    // ─── Event: passer au suivant ───
    socket.on("next", () => {
      cleanup(io, socket);
      tryMatch(io, socket);
    });

    // ─── Déconnexion ───
    socket.on("disconnect", () => {
      console.log(`Disconnected: ${socket.user.username} (${socket.id})`);
      cleanup(io, socket);
    });
  });
}
