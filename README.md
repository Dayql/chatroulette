# Chatroulette

Application de chat aléatoire en temps réel. Les utilisateurs créent un compte, puis sont mis en relation avec un partenaire aléatoire pour discuter.

## Stack technique

- **Backend** : Node.js, Express, Socket.IO, JWT, bcryptjs
- **Frontend** : HTML, CSS, JavaScript vanilla, Socket.IO client

## Structure du projet

```
├── server/
│   ├── index.js              # Point d'entrée (Express + Socket.IO)
│   ├── config.js             # Constantes (SECRET, PORT)
│   ├── state.js              # État en mémoire (users, queue, pairs)
│   ├── middleware/
│   │   └── auth.js           # Vérification JWT (REST + WebSocket)
│   ├── routes/
│   │   └── auth.js           # Routes REST (signup, login, logout)
│   └── websocket/
│       └── handlers.js       # Événements WebSocket (match, chat, next)
├── client/
│   ├── index.html            # Structure HTML
│   ├── style.css             # Styles
│   └── app.js                # Logique client (auth, WebSocket, UI)
```

## Installation et lancement

```bash
# Cloner le projet
git clone https://github.com/Dayql/chatroulette.git
cd chatroulette

# Installer les dépendances
npm install

# Lancer le serveur
npm start
```

L'application est accessible sur **http://localhost:3000**.

## Utilisation

1. Ouvrir http://localhost:3000 dans un navigateur
2. Créer un compte (nom d'utilisateur, email, mot de passe)
3. Cliquer sur **Chercher un partenaire**
4. Ouvrir un deuxième onglet, créer un autre compte et chercher aussi
5. Les deux utilisateurs sont mis en relation et peuvent discuter
6. Cliquer sur **Suivant** pour changer de partenaire
7. Cliquer sur **Déconnexion** pour se déconnecter

## API REST

| Méthode | Route              | Description         |
|---------|--------------------|---------------------|
| POST    | `/api/auth/signup` | Inscription         |
| POST    | `/api/auth/login`  | Connexion           |
| GET     | `/api/auth/logout` | Déconnexion (JWT)   |

## Événements WebSocket

| Client → Serveur  | Description                        |
|--------------------|------------------------------------|
| `findPartner`      | Rejoindre la file d'attente        |
| `sendMessage`      | Envoyer un message au partenaire   |
| `next`             | Passer au partenaire suivant       |

| Serveur → Client       | Description                        |
|-------------------------|------------------------------------|
| `waiting`               | En attente d'un partenaire         |
| `matched`               | Partenaire trouvé                  |
| `message`               | Message reçu                       |
| `partnerDisconnected`   | Le partenaire s'est déconnecté     |
