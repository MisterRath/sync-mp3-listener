# SyncMusic - Application de Salles de Musique Synchronisées

## Description

SyncMusic est une application web en temps réel qui permet aux utilisateurs de créer et rejoindre des salles de musique où ils peuvent écouter des fichiers MP3 de manière synchronisée. L'application inclut un système de file d'attente et un mécanisme de vote pour passer les morceaux.

## Fonctionnalités

- 🎵 **Salles de musique en temps réel** : Créez ou rejoignez des salles pour écouter ensemble
- 📁 **Upload de fichiers MP3** : Glissez-déposez ou sélectionnez des fichiers MP3 (max 50MB)
- 🔄 **Synchronisation automatique** : Tous les utilisateurs écoutent la même musique au même moment
- 📋 **Système de file d'attente** : Les musiques s'ajoutent automatiquement à la queue
- 🗳️ **Vote pour passer** : Si la moitié des utilisateurs vote, la musique passe automatiquement
- 👥 **Gestion des utilisateurs** : Affichage en temps réel du nombre d'utilisateurs connectés

## Technologies utilisées

- **Backend** : Node.js, Express.js, Socket.IO
- **Frontend** : HTML5, CSS3, JavaScript (Vanilla)
- **Upload** : Multer pour la gestion des fichiers
- **Audio** : HTML5 Audio API
- **Déploiement** : Compatible Railway

## Installation et utilisation

### Prérequis
- Node.js version 16 ou supérieure
- npm ou yarn

### Installation locale
```bash
# Cloner le projet
git clone <votre-repo>
cd syncmusic-room

# Installer les dépendances
npm install

# Démarrer le serveur de développement
npm run dev

# Ou démarrer en production
npm start
```

L'application sera accessible sur `http://localhost:3000`

### Déploiement sur Railway

1. Connectez votre repository GitHub à Railway
2. Railway détectera automatiquement qu'il s'agit d'un projet Node.js
3. Les variables d'environnement seront configurées automatiquement
4. Le déploiement se fera automatiquement

#### Variables d'environnement (optionnelles)
- `PORT` : Port du serveur (défaut: 3000)

## Structure du projet

```
syncmusic-room/
├── server.js              # Serveur Express + Socket.IO
├── package.json            # Dépendances et scripts
├── public/                 # Fichiers statiques
│   ├── index.html         # Page principale
│   ├── style.css          # Styles CSS
│   └── script.js          # JavaScript côté client
├── uploads/               # Dossier des fichiers MP3 uploadés
└── .github/
    └── copilot-instructions.md
```

## API Endpoints

### HTTP Routes
- `GET /` : Page principale
- `POST /upload/:roomId` : Upload d'un fichier MP3
- `GET /room/:roomId/state` : État actuel d'une salle
- `GET /uploads/:filename` : Servir les fichiers audio

### Socket.IO Events

#### Côté client → serveur
- `joinRoom(roomId)` : Rejoindre une salle
- `leaveRoom(roomId)` : Quitter une salle
- `voteSkip(roomId)` : Voter pour passer la musique
- `songEnded(roomId)` : Signaler la fin d'une musique

#### Côté serveur → client
- `roomUpdate(roomState)` : Mise à jour de l'état de la salle
- `userJoined({userId, userCount})` : Utilisateur rejoint
- `userLeft({userId, userCount})` : Utilisateur quitte
- `songSkipped()` : Musique passée par vote

## Utilisation

1. **Accéder à l'application** : Ouvrez votre navigateur sur l'URL de l'application
2. **Créer/Rejoindre une salle** : Entrez un nom de salle et cliquez sur "Rejoindre/Créer Salle"
3. **Ajouter de la musique** : Glissez un fichier MP3 dans la zone d'upload ou cliquez pour sélectionner
4. **Écouter ensemble** : La musique se synchronise automatiquement pour tous les utilisateurs
5. **Gérer la playlist** : Utilisez le bouton de vote pour passer les morceaux

## Limitations

- Taille max des fichiers : 50MB
- Formats supportés : MP3 uniquement
- Les fichiers sont stockés localement sur le serveur

## Sécurité

- Validation des types de fichiers
- Limitation de la taille des uploads
- Protection contre les injections XSS
- Gestion des erreurs côté serveur

## Support des navigateurs

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## Développement

### Scripts disponibles
- `npm start` : Démarrer en production
- `npm run dev` : Démarrer avec nodemon (rechargement auto)

### Structure des données

#### Room State
```javascript
{
  id: "nom-salle",
  userCount: 3,
  currentSong: {
    id: "uuid",
    filename: "uuid-song.mp3",
    originalName: "Ma Chanson.mp3",
    path: "/uploads/uuid-song.mp3",
    uploadedAt: "2024-01-01T00:00:00.000Z"
  },
  queue: [...], // Tableau des prochaines musiques
  isPlaying: true,
  startTime: "2024-01-01T00:00:00.000Z",
  skipVotes: 1,
  requiredSkipVotes: 2
}
```

## Contributions

Les contributions sont les bienvenues ! Pour contribuer :

1. Forkez le projet
2. Créez une branche pour votre fonctionnalité
3. Committez vos changements
4. Poussez vers la branche
5. Ouvrez une Pull Request

## Licence

Ce projet est sous licence ISC.

## Auteur

Développé pour permettre l'écoute synchronisée de musique entre amis et collègues.