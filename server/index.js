import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

import { PORT } from "./config.js";
import authRoutes from "./routes/auth.js";
import { registerHandlers } from "./websocket/handlers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ─── Middleware Express ───
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "client")));

// ─── Routes REST ───
app.use("/api/auth", authRoutes);

// ─── WebSocket ───
registerHandlers(io);

// ─── Start ───
server.listen(PORT, () => {
  console.log(`Chatroulette running on http://localhost:${PORT}`);
});
