// ─── In-memory storage (BDD simulée) ───
export const users = []; // { id, username, email, passwordHash }
let nextId = 1;

// ─── Server State (en mémoire) ───
export const waitingQueue = []; // socket.id[]
export const activePairs = new Map(); // socketId → partnerSocketId

// ─── Helpers ───
export function addUser({ username, email, passwordHash }) {
  const user = { id: String(nextId++), username, email, passwordHash };
  users.push(user);
  return user;
}

export function findUserByEmail(email) {
  return users.find((u) => u.email === email);
}

export function findUserByUsername(username) {
  return users.find((u) => u.username === username);
}
