import jwt from "jsonwebtoken";
import { SECRET } from "../config.js";

// Middleware Express : vérification JWT sur les routes REST
export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Non authentifié" },
    });
  }
  try {
    req.user = jwt.verify(authHeader.split(" ")[1], SECRET);
    next();
  } catch {
    res.status(401).json({
      error: { code: "INVALID_TOKEN", message: "Token invalide ou expiré" },
    });
  }
}

// Middleware Socket.IO : vérification JWT sur la connexion WS
export function wsAuthMiddleware(socket, next) {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Unauthorized"));
  try {
    socket.user = jwt.verify(token, SECRET);
    next();
  } catch {
    next(new Error("Unauthorized: Invalid or expired token"));
  }
}
