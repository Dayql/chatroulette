import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { SECRET } from "../config.js";
import { addUser, findUserByEmail, findUserByUsername } from "../state.js";
import { verifyToken } from "../middleware/auth.js";

const router = Router();

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      error: { code: "MISSING_FIELDS", message: "Tous les champs sont requis" },
    });
  }
  if (password.length < 6) {
    return res.status(400).json({
      error: { code: "WEAK_PASSWORD", message: "Le mot de passe doit faire au moins 6 caractères" },
    });
  }
  if (findUserByEmail(email)) {
    return res.status(409).json({
      error: { code: "EMAIL_TAKEN", message: "Cet email est déjà utilisé" },
    });
  }
  if (findUserByUsername(username)) {
    return res.status(409).json({
      error: { code: "USERNAME_TAKEN", message: "Ce nom d'utilisateur est déjà pris" },
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = addUser({ username, email, passwordHash });

  const token = jwt.sign({ id: user.id, username: user.username }, SECRET, {
    expiresIn: "24h",
  });

  res.status(201).json({
    user: { id: user.id, username: user.username, email: user.email },
    token,
  });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: { code: "MISSING_FIELDS", message: "Tous les champs sont requis" },
    });
  }

  const user = findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({
      error: { code: "INVALID_CREDENTIALS", message: "Email ou mot de passe incorrect" },
    });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, SECRET, {
    expiresIn: "24h",
  });

  res.status(200).json({
    user: { id: user.id, username: user.username, email: user.email },
    token,
  });
});

// GET /api/auth/logout
router.get("/logout", verifyToken, (req, res) => {
  res.status(200).json({ message: "Logged out" });
});

export default router;
