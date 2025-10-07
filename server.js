const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Configuration
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = 'uploads';
const YOUTUBE_CACHE_DIR = 'youtube_cache';

// Créer les dossiers s'ils n'existent pas
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

if (!fs.existsSync(YOUTUBE_CACHE_DIR)) {
  fs.mkdirSync(YOUTUBE_CACHE_DIR, { recursive: true });
}

// Initialiser yt-dlp
const ytDlpWrap = new YTDlpWrap();

// Configuration du chemin Python pour Windows
if (process.platform === 'win32') {
  try {
    const pythonPath = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(pythonPath)) {
      ytDlpWrap.setPythonPath(pythonPath);
      console.log('Utilisation de Python depuis .venv');
    }
  } catch (error) {
    console.log('Utilisation de Python système par défaut');
  }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/youtube', express.static(YOUTUBE_CACHE_DIR));

// Configuration multer pour l'upload des fichiers MP3
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'audio/mpeg' || file.originalname.toLowerCase().endsWith('.mp3')) {
    cb(null, true);
  } else {
    cb(new Error('Seuls les fichiers MP3 sont autorisés!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  }
});

// Structure de données pour les salles
const rooms = new Map();

class MusicRoom {
  constructor(roomId) {
    this.id = roomId;
    this.users = new Set();
    this.queue = [];
    this.currentSong = null;
    this.isPlaying = false;
    this.startTime = null;
    this.skipVotes = new Set();
  }

  addUser(userId) {
    this.users.add(userId);
  }

  removeUser(userId) {
    this.users.delete(userId);
    this.skipVotes.delete(userId);
  }

  addToQueue(song) {
    if (!this.currentSong) {
      this.currentSong = song;
      this.isPlaying = true;
      this.startTime = Date.now();
      this.skipVotes.clear();
      console.log(`Lecture automatique: ${song.originalName}`);
    } else {
      this.queue.push(song);
      console.log(`Ajouté à la queue: ${song.originalName}`);
    }
  }

  skipSong() {
    console.log(`Fin de la musique: ${this.currentSong?.originalName || 'Inconnue'}`);
    
    if (this.queue.length > 0) {
      this.currentSong = this.queue.shift();
      this.startTime = Date.now();
      this.isPlaying = true;
      this.skipVotes.clear();
      console.log(`Lecture automatique suivante: ${this.currentSong.originalName}`);
    } else {
      console.log('Queue vide, arrêt de la lecture');
      this.currentSong = null;
      this.isPlaying = false;
      this.startTime = null;
      this.skipVotes.clear();
    }
  }

  voteSkip(userId) {
    this.skipVotes.add(userId);
    const requiredVotes = Math.ceil(this.users.size / 2);
    return this.skipVotes.size >= requiredVotes;
  }

  getRoomState() {
    return {
      id: this.id,
      userCount: this.users.size,
      currentSong: this.currentSong,
      queue: this.queue,
      isPlaying: this.isPlaying,
      startTime: this.startTime,
      skipVotes: this.skipVotes.size,
      requiredSkipVotes: Math.ceil(this.users.size / 2)
    };
  }
}

// Routes API
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload/:roomId', upload.single('mp3file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier MP3 trouvé' });
    }

    const roomId = req.params.roomId;
    const room = rooms.get(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Salle introuvable' });
    }

    const song = {
      id: uuidv4(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: `/uploads/${req.file.filename}`,
      uploadedAt: new Date().toISOString(),
      source: 'upload'
    };

    room.addToQueue(song);

    // Notifier tous les utilisateurs de la salle
    io.to(roomId).emit('roomUpdate', room.getRoomState());
    
    // Mettre à jour la liste des salles pour tous
    broadcastRoomsList();

    res.json({ 
      message: 'Fichier uploadé avec succès', 
      song: song,
      roomState: room.getRoomState()
    });

  } catch (error) {
    console.error('Erreur upload:', error);
    res.status(500).json({ error: 'Erreur lors de l\'upload' });
  }
});

// Route pour télécharger l'audio depuis YouTube
app.post('/youtube/:roomId', async (req, res) => {
  try {
    const { url } = req.body;
    const roomId = req.params.roomId;

    if (!url) {
      return res.status(400).json({ error: 'URL YouTube requise' });
    }

    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Salle introuvable' });
    }

    // Validation de l'URL YouTube
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube|youtu|youtube-nocookie)\.(com|be)\/(watch\?v=|embed\/|v\/|.+\?v=)?([^&=%\?]{11})/;
    if (!youtubeRegex.test(url)) {
      return res.status(400).json({ error: 'URL YouTube invalide' });
    }

    console.log(`Téléchargement YouTube démarré: ${url}`);
    
    // Générer un nom de fichier unique
    const filename = `${uuidv4()}.%(ext)s`;
    const outputPath = path.join(YOUTUBE_CACHE_DIR, filename);

    try {
      // Options pour yt-dlp
      const ytDlpOptions = [
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--output', outputPath,
        '--no-playlist',
        '--max-filesize', '50M',
        url
      ];

      // Exécuter yt-dlp
      await ytDlpWrap.execPromise(ytDlpOptions);

      // Trouver le fichier téléchargé (yt-dlp remplace %(ext)s par l'extension réelle)
      const files = fs.readdirSync(YOUTUBE_CACHE_DIR);
      const downloadedFile = files.find(file => file.startsWith(filename.replace('.%(ext)s', '')));

      if (!downloadedFile) {
        throw new Error('Fichier téléchargé introuvable');
      }

      // Obtenir les métadonnées de la vidéo
      let videoTitle = 'Audio YouTube';
      try {
        const metadataOptions = [
          '--print', 'title',
          '--no-download',
          url
        ];
        const titleResult = await ytDlpWrap.execPromise(metadataOptions);
        videoTitle = titleResult.trim() || 'Audio YouTube';
      } catch (metaError) {
        console.log('Impossible de récupérer le titre, utilisation du titre par défaut');
      }

      const song = {
        id: uuidv4(),
        filename: downloadedFile,
        originalName: `${videoTitle}.mp3`,
        path: `/youtube/${downloadedFile}`,
        uploadedAt: new Date().toISOString(),
        source: 'youtube',
        youtubeUrl: url
      };

      room.addToQueue(song);

      // Notifier tous les utilisateurs de la salle
      io.to(roomId).emit('roomUpdate', room.getRoomState());
      
      // Mettre à jour la liste des salles pour tous
      broadcastRoomsList();

      console.log(`Téléchargement terminé: ${videoTitle}`);

      res.json({ 
        message: 'Audio YouTube téléchargé avec succès', 
        song: song,
        roomState: room.getRoomState()
      });

    } catch (ytDlpError) {
      console.error('Erreur yt-dlp:', ytDlpError);
      
      // Messages d'erreur plus spécifiques
      let errorMessage = 'Erreur lors du téléchargement';
      if (ytDlpError.message.includes('Video unavailable')) {
        errorMessage = 'Vidéo non disponible ou privée';
      } else if (ytDlpError.message.includes('too large')) {
        errorMessage = 'Fichier trop volumineux (max 50MB)';
      } else if (ytDlpError.message.includes('No such file')) {
        errorMessage = 'URL invalide ou contenu non accessible';
      }
      
      return res.status(400).json({ error: errorMessage });
    }

  } catch (error) {
    console.error('Erreur téléchargement YouTube:', error);
    res.status(500).json({ error: 'Erreur serveur lors du téléchargement' });
  }
});

app.get('/room/:roomId/state', (req, res) => {
  const roomId = req.params.roomId;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ error: 'Salle introuvable' });
  }

  res.json(room.getRoomState());
});

app.get('/api/rooms', (req, res) => {
  try {
    const roomsList = Array.from(rooms.values()).map(room => ({
      id: room.id,
      userCount: room.users.size,
      currentSong: room.currentSong ? {
        originalName: room.currentSong.originalName,
        uploadedAt: room.currentSong.uploadedAt
      } : null,
      queueLength: room.queue.length,
      isPlaying: room.isPlaying
    }));
    
    res.json(roomsList);
  } catch (error) {
    console.error('Erreur lors de la récupération des salles:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Socket.IO pour la synchronisation en temps réel
io.on('connection', (socket) => {
  console.log('Utilisateur connecté:', socket.id);

  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new MusicRoom(roomId));
    }
    
    const room = rooms.get(roomId);
    room.addUser(socket.id);
    
    // Envoyer l'état actuel de la salle
    socket.emit('roomUpdate', room.getRoomState());
    
    // Notifier les autres utilisateurs
    socket.to(roomId).emit('userJoined', { 
      userId: socket.id, 
      userCount: room.users.size 
    });

    // Notifier tous les clients de la mise à jour de la liste des salles
    broadcastRoomsList();

    console.log(`Utilisateur ${socket.id} a rejoint la salle ${roomId}`);
  });

  socket.on('leaveRoom', (roomId) => {
    socket.leave(roomId);
    
    const room = rooms.get(roomId);
    if (room) {
      room.removeUser(socket.id);
      
      if (room.users.size === 0) {
        rooms.delete(roomId);
        console.log(`Salle ${roomId} supprimée (vide)`);
        broadcastRoomsList();
      } else {
        socket.to(roomId).emit('userLeft', { 
          userId: socket.id, 
          userCount: room.users.size 
        });
        socket.to(roomId).emit('roomUpdate', room.getRoomState());
        broadcastRoomsList();
      }
    }
  });

  socket.on('voteSkip', (roomId) => {
    const room = rooms.get(roomId);
    if (room && room.currentSong) {
      const shouldSkip = room.voteSkip(socket.id);
      
      if (shouldSkip) {
        room.skipSong();
        io.to(roomId).emit('songSkipped');
        io.to(roomId).emit('roomUpdate', room.getRoomState());
      } else {
        io.to(roomId).emit('roomUpdate', room.getRoomState());
      }
    }
  });

  socket.on('songEnded', (roomId) => {
    const room = rooms.get(roomId);
    if (room && room.currentSong) {
      console.log(`Song ended in room ${roomId}: ${room.currentSong.originalName}`);
      room.skipSong();
      
      // Notifier tous les clients de la mise à jour
      io.to(roomId).emit('roomUpdate', room.getRoomState());
      
      if (room.currentSong) {
        io.to(roomId).emit('autoPlayNext', room.currentSong);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Utilisateur déconnecté:', socket.id);
    
    // Retirer l'utilisateur de toutes les salles
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.has(socket.id)) {
        room.removeUser(socket.id);
        
        if (room.users.size === 0) {
          rooms.delete(roomId);
          broadcastRoomsList();
        } else {
          socket.to(roomId).emit('userLeft', { 
            userId: socket.id, 
            userCount: room.users.size 
          });
          socket.to(roomId).emit('roomUpdate', room.getRoomState());
          broadcastRoomsList();
        }
      }
    }
  });
});

// Fonction pour diffuser la liste des salles à tous les clients connectés
function broadcastRoomsList() {
  const roomsList = Array.from(rooms.values()).map(room => ({
    id: room.id,
    userCount: room.users.size,
    currentSong: room.currentSong ? {
      originalName: room.currentSong.originalName,
      uploadedAt: room.currentSong.uploadedAt
    } : null,
    queueLength: room.queue.length,
    isPlaying: room.isPlaying
  }));
  
  io.emit('roomsListUpdate', roomsList);
}

// Gestion des erreurs
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Fichier trop volumineux (max 50MB)' });
    }
  }
  
  if (error.message === 'Seuls les fichiers MP3 sont autorisés!') {
    return res.status(400).json({ error: error.message });
  }
  
  console.error(error);
  res.status(500).json({ error: 'Erreur serveur' });
});

server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});