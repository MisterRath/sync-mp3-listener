const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const ytdl = require('ytdl-core');
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
const COOKIES_DIR = 'cookies';

// Créer les dossiers s'ils n'existent pas
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

if (!fs.existsSync(YOUTUBE_CACHE_DIR)) {
  fs.mkdirSync(YOUTUBE_CACHE_DIR, { recursive: true });
}

if (!fs.existsSync(COOKIES_DIR)) {
  fs.mkdirSync(COOKIES_DIR, { recursive: true });
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

// Fonction pour créer un fichier de cookies par défaut
function createDefaultCookiesFile() {
  const cookiesPath = path.join(COOKIES_DIR, 'youtube_cookies.txt');
  
  if (!fs.existsSync(cookiesPath)) {
    // Créer un fichier de cookies vide au format Netscape
    const defaultCookies = `# Netscape HTTP Cookie File
# This is a generated file! Do not edit.

# To use your own cookies:
# 1. Install a browser extension like "Get cookies.txt LOCALLY" 
# 2. Go to YouTube and make sure you're logged in
# 3. Export cookies for youtube.com
# 4. Replace this file with your exported cookies

# Exemple de format (remplacez par vos vrais cookies):
# .youtube.com	TRUE	/	FALSE	1234567890	session_token	your_session_token_here
`;
    
    fs.writeFileSync(cookiesPath, defaultCookies);
    console.log('Fichier de cookies par défaut créé:', cookiesPath);
  }
  
  return cookiesPath;
}

// Créer le fichier de cookies par défaut
const cookiesPath = createDefaultCookiesFile();

// Fonction pour essayer différentes méthodes de téléchargement
async function downloadYouTubeAudio(url, outputPath) {
  console.log('Tentative de téléchargement YouTube:', url);
  
  // Méthode 1: ytdl-core (plus fiable pour les serveurs)
  try {
    console.log('Méthode 1: Utilisation de ytdl-core...');
    
    if (!ytdl.validateURL(url)) {
      throw new Error('URL YouTube invalide pour ytdl-core');
    }
    
    const info = await ytdl.getInfo(url);
    const videoTitle = info.videoDetails.title.replace(/[^\w\s\-]/gi, '').substring(0, 50) || 'Audio YouTube';
    
    const uniqueFilename = `${uuidv4()}.mp3`;
    const filePath = path.join(YOUTUBE_CACHE_DIR, uniqueFilename);
    
    const audioStream = ytdl(url, { 
      filter: 'audioonly',
      quality: 'highestaudio',
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com'
        }
      }
    });
    
    const writeStream = fs.createWriteStream(filePath);
    
    await new Promise((resolve, reject) => {
      audioStream.pipe(writeStream);
      audioStream.on('error', reject);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      
      setTimeout(() => {
        reject(new Error('Timeout de téléchargement ytdl-core'));
      }, 60000);
    });
    
    console.log('Téléchargement réussi avec ytdl-core:', videoTitle);
    return { filename: uniqueFilename, title: videoTitle };
    
  } catch (ytdlError) {
    console.log('ytdl-core a échoué:', ytdlError.message);
    
    // Méthode 2: yt-dlp avec cookies du navigateur
    try {
      console.log('Méthode 2: Utilisation de yt-dlp avec cookies du navigateur...');
      
      const filename = `${uuidv4()}.%(ext)s`;
      const outputPathYtDlp = path.join(YOUTUBE_CACHE_DIR, filename);
      
      // Essayer d'abord avec les cookies du navigateur Chrome
      let ytDlpOptions = [
        '--cookies-from-browser', 'chrome',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--output', outputPathYtDlp,
        '--no-playlist',
        '--max-filesize', '50M',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--referer', 'https://www.youtube.com/',
        url
      ];
      
      try {
        await ytDlpWrap.execPromise(ytDlpOptions);
      } catch (chromeError) {
        console.log('Cookies Chrome échoués, essai avec Firefox...');
        
        // Essayer avec Firefox
        ytDlpOptions[1] = 'firefox';
        try {
          await ytDlpWrap.execPromise(ytDlpOptions);
        } catch (firefoxError) {
          console.log('Cookies Firefox échoués, essai avec Edge...');
          
          // Essayer avec Edge
          ytDlpOptions[1] = 'edge';
          try {
            await ytDlpWrap.execPromise(ytDlpOptions);
          } catch (edgeError) {
            // Méthode 3: yt-dlp avec fichier de cookies personnalisé
            console.log('Méthode 3: Utilisation de yt-dlp avec fichier de cookies...');
            
            ytDlpOptions = [
              '--cookies', cookiesPath,
              '--extract-audio',
              '--audio-format', 'mp3',
              '--audio-quality', '192K',
              '--output', outputPathYtDlp,
              '--no-playlist',
              '--max-filesize', '50M',
              '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              '--referer', 'https://www.youtube.com/',
              '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              '--add-header', 'Accept-Language:en-us,en;q=0.5',
              '--add-header', 'Sec-Fetch-Mode:navigate',
              url
            ];
            
            try {
              await ytDlpWrap.execPromise(ytDlpOptions);
            } catch (cookieFileError) {
              // Méthode 4: yt-dlp sans cookies (dernière chance)
              console.log('Méthode 4: Utilisation de yt-dlp sans cookies...');
              
              ytDlpOptions = [
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '192K',
                '--output', outputPathYtDlp,
                '--no-playlist',
                '--max-filesize', '50M',
                '--no-check-certificate',
                '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                '--referer', 'https://www.youtube.com/',
                '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                '--add-header', 'Accept-Language:en-us,en;q=0.5',
                url
              ];
              
              await ytDlpWrap.execPromise(ytDlpOptions);
            }
          }
        }
      }
      
      // Trouver le fichier téléchargé
      const files = fs.readdirSync(YOUTUBE_CACHE_DIR);
      const downloadedFile = files.find(file => file.startsWith(filename.replace('.%(ext)s', '')));
      
      if (!downloadedFile) {
        throw new Error('Fichier téléchargé introuvable');
      }
      
      // Obtenir le titre
      let videoTitle = 'Audio YouTube';
      try {
        const metadataOptions = ['--print', 'title', '--no-download', url];
        const titleResult = await ytDlpWrap.execPromise(metadataOptions);
        videoTitle = titleResult.trim() || 'Audio YouTube';
      } catch (metaError) {
        console.log('Impossible de récupérer le titre');
      }
      
      console.log('Téléchargement réussi avec yt-dlp:', videoTitle);
      return { filename: downloadedFile, title: videoTitle };
      
    } catch (ytDlpError) {
      console.error('Toutes les méthodes de téléchargement ont échoué');
      throw new Error('Impossible de télécharger la vidéo. Essayez avec une autre vidéo ou vérifiez que la vidéo est publique.');
    }
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
    
    try {
      // Utiliser notre fonction de téléchargement avec fallback
      const result = await downloadYouTubeAudio(url);
      
      const song = {
        id: uuidv4(),
        filename: result.filename,
        originalName: `${result.title}.mp3`,
        path: `/youtube/${result.filename}`,
        uploadedAt: new Date().toISOString(),
        source: 'youtube',
        youtubeUrl: url
      };

      room.addToQueue(song);

      // Notifier tous les utilisateurs de la salle
      io.to(roomId).emit('roomUpdate', room.getRoomState());
      
      // Mettre à jour la liste des salles pour tous
      broadcastRoomsList();

      console.log(`Téléchargement terminé: ${result.title}`);

      res.json({ 
        message: 'Audio YouTube téléchargé avec succès', 
        song: song,
        roomState: room.getRoomState()
      });

    } catch (downloadError) {
      console.error('Erreur lors du téléchargement:', downloadError);
      
      // Messages d'erreur spécifiques
      let errorMessage = 'Erreur lors du téléchargement';
      
      if (downloadError.message.includes('Sign in to confirm')) {
        errorMessage = 'Cette vidéo nécessite une authentification. Consultez les instructions pour configurer les cookies.';
      } else if (downloadError.message.includes('Video unavailable')) {
        errorMessage = 'Vidéo non disponible ou privée';
      } else if (downloadError.message.includes('too large')) {
        errorMessage = 'Fichier trop volumineux (max 50MB)';
      } else if (downloadError.message.includes('private')) {
        errorMessage = 'Vidéo privée ou géo-bloquée';
      } else if (downloadError.message.includes('Impossible de télécharger')) {
        errorMessage = downloadError.message;
      }
      
      return res.status(400).json({ error: errorMessage });
    }

  } catch (error) {
    console.error('Erreur générale téléchargement YouTube:', error);
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

// Route pour obtenir les instructions de configuration des cookies
app.get('/youtube/cookies-help', (req, res) => {
  const instructions = {
    title: 'Configuration des cookies YouTube',
    instructions: [
      {
        step: 1,
        title: 'Installer une extension de navigateur',
        description: 'Installez "Get cookies.txt LOCALLY" ou "cookies.txt" sur Chrome/Firefox'
      },
      {
        step: 2,
        title: 'Se connecter à YouTube',
        description: 'Allez sur youtube.com et connectez-vous à votre compte'
      },
      {
        step: 3,
        title: 'Exporter les cookies',
        description: 'Cliquez sur l\'extension et exportez les cookies pour youtube.com'
      },
      {
        step: 4,
        title: 'Remplacer le fichier de cookies',
        description: `Remplacez le fichier: ${cookiesPath} par vos cookies exportés`
      },
      {
        step: 5,
        title: 'Redémarrer le serveur',
        description: 'Redémarrez l\'application pour prendre en compte les nouveaux cookies'
      }
    ],
    cookiesPath: cookiesPath,
    note: 'Les cookies permettent de contourner les restrictions YouTube et d\'accéder aux vidéos qui nécessitent une authentification.'
  };
  
  res.json(instructions);
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

async function downloadFromYoutube(url, outputPath) {
    console.log('Downloading from YouTube:', url);
    
    const ytdl = require('ytdl-core');
    const fs = require('fs');
    const path = require('path');
    
    return new Promise(async (resolve, reject) => {
        try {
            // Verify URL is valid
            if (!ytdl.validateURL(url)) {
                throw new Error('Invalid YouTube URL');
            }
            
            // Get video info first
            const info = await ytdl.getInfo(url);
            const title = info.videoDetails.title.replace(/[^\w\s]/gi, '').substring(0, 50);
            
            // Create proper output path
            const finalPath = path.join(path.dirname(outputPath), `${title}.mp3`);
            
            // Download audio stream
            const stream = ytdl(url, {
                quality: 'highestaudio',
                filter: 'audioonly',
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate',
                        'DNT': '1',
                        'Connection': 'keep-alive',
                        'Referer': 'https://www.youtube.com/'
                    }
                }
            });
            
            const writeStream = fs.createWriteStream(finalPath);
            
            stream.pipe(writeStream);
            
            stream.on('error', (error) => {
                console.error('Stream error:', error);
                reject(new Error('Erreur lors du téléchargement audio'));
            });
            
            writeStream.on('error', (error) => {
                console.error('Write error:', error);
                reject(new Error('Erreur lors de l\'écriture du fichier'));
            });
            
            writeStream.on('finish', () => {
                console.log('Download completed:', finalPath);
                resolve(finalPath);
            });
            
        } catch (error) {
            console.error('YouTube download error:', error);
            reject(new Error('Erreur lors du téléchargement: ' + error.message));
        }
    });
}