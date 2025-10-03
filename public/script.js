// Variables globales
let socket;
let currentRoom = null;
let currentAudioElement = null;
let isAudioSyncing = false;

// Éléments DOM
const roomInput = document.getElementById('roomInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const refreshRoomsBtn = document.getElementById('refreshRoomsBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const currentRoomDiv = document.getElementById('currentRoom');
const musicSection = document.getElementById('musicSection');
const roomNameSpan = document.getElementById('roomName');
const userCountSpan = document.getElementById('userCount');
const roomsList = document.getElementById('roomsList');
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const uploadStatus = document.getElementById('uploadStatus');
const currentSongInfo = document.getElementById('currentSongInfo');
const audioPlayer = document.getElementById('audioPlayer');
const skipBtn = document.getElementById('skipBtn');
const skipVotesSpan = document.getElementById('skipVotes');
const requiredVotesSpan = document.getElementById('requiredVotes');
const queueList = document.getElementById('queueList');
const statusMessages = document.getElementById('statusMessages');

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
    setupEventListeners();
    loadAvailableRooms();
});

function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        showStatus('Connexion établie', 'success');
    });
    
    socket.on('disconnect', () => {
        showStatus('Connexion perdue', 'error');
    });
    
    socket.on('roomUpdate', (roomState) => {
        updateRoomState(roomState);
    });
    
    socket.on('userJoined', (data) => {
        showStatus(`Un utilisateur a rejoint la salle`, 'success');
        updateUserCount(data.userCount);
    });
    
    socket.on('userLeft', (data) => {
        showStatus(`Un utilisateur a quitté la salle`, 'warning');
        updateUserCount(data.userCount);
    });
    
    socket.on('songSkipped', () => {
        showStatus('Musique passée par vote', 'warning');
    });
    
    socket.on('autoPlayNext', (nextSong) => {
        showStatus(`Lecture automatique: ${nextSong.originalName}`, 'success');
    });
    
    socket.on('roomsListUpdate', (rooms) => {
        updateRoomsList(rooms);
    });
}

function setupEventListeners() {
    // Rejoindre une salle
    joinRoomBtn.addEventListener('click', joinRoom);
    roomInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinRoom();
    });
    
    // Quitter une salle
    leaveRoomBtn.addEventListener('click', leaveRoom);
    
    // Rafraîchir la liste des salles
    refreshRoomsBtn.addEventListener('click', loadAvailableRooms);
    
    // Upload de fichier
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('drop', handleDrop);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    fileInput.addEventListener('change', handleFileSelect);
    
    // Contrôles du lecteur
    skipBtn.addEventListener('click', voteSkip);
    audioPlayer.addEventListener('ended', () => {
        if (currentRoom) {
            socket.emit('songEnded', currentRoom);
            showStatus('Musique terminée, passage à la suivante...', 'success');
        }
    });
    
    // Gestion de l'erreur audio
    audioPlayer.addEventListener('error', (e) => {
        console.error('Erreur audio:', e);
        showStatus('Erreur de lecture audio', 'error');
        
        // Essayer de passer à la suivante en cas d'erreur
        if (currentRoom) {
            socket.emit('songEnded', currentRoom);
        }
    });
    
    // Synchronisation automatique périodique
    setInterval(() => {
        if (currentRoom && !audioPlayer.paused && audioPlayer.duration) {
            // Vérifier la synchronisation toutes les 5 secondes
            syncAudioIfNeeded();
        }
    }, 5000);
    
    // Synchronisation audio
    audioPlayer.addEventListener('play', handleAudioPlay);
    audioPlayer.addEventListener('pause', handleAudioPause);
    
    // Variables pour la synchronisation
    window.roomStartTime = null;
    window.isRoomPlaying = false;
}

function joinRoom() {
    const roomId = roomInput.value.trim();
    if (!roomId) {
        showStatus('Veuillez entrer un nom de salle', 'error');
        return;
    }
    
    currentRoom = roomId;
    socket.emit('joinRoom', roomId);
    
    roomNameSpan.textContent = roomId;
    currentRoomDiv.classList.remove('hidden');
    musicSection.classList.remove('hidden');
    
    showStatus(`Rejoint la salle: ${roomId}`, 'success');
}

function leaveRoom() {
    if (currentRoom) {
        socket.emit('leaveRoom', currentRoom);
        currentRoom = null;
        
        currentRoomDiv.classList.add('hidden');
        musicSection.classList.add('hidden');
        
        // Arrêter la musique
        audioPlayer.pause();
        audioPlayer.src = '';
        
        // Recharger la liste des salles
        loadAvailableRooms();
        
        showStatus('Salle quittée', 'warning');
    }
}

function updateRoomState(roomState) {
    // Mettre à jour le compteur d'utilisateurs
    updateUserCount(roomState.userCount);
    
    // Mettre à jour les votes de skip
    skipVotesSpan.textContent = roomState.skipVotes || 0;
    requiredVotesSpan.textContent = roomState.requiredSkipVotes || 1;
    
    // Stocker les informations de synchronisation
    window.roomStartTime = roomState.startTime;
    window.isRoomPlaying = roomState.isPlaying;
    
    // Mettre à jour la musique actuelle
    if (roomState.currentSong) {
        updateCurrentSong(roomState.currentSong, roomState.startTime, roomState.isPlaying);
        skipBtn.disabled = false;
    } else {
        clearCurrentSong();
        skipBtn.disabled = true;
    }
    
    // Mettre à jour la queue
    updateQueue(roomState.queue || []);
}

function updateUserCount(count) {
    userCountSpan.textContent = `${count} utilisateur(s)`;
}

function updateCurrentSong(song, startTime, isPlaying) {
    const playingIcon = isPlaying ? '<span class="playing-indicator">🎵</span>' : '';
    currentSongInfo.innerHTML = `
        <p>${playingIcon}<strong>${song.originalName}</strong></p>
        <small>Ajouté le ${new Date(song.uploadedAt).toLocaleString()}</small>
        ${isPlaying ? '<small style="color: var(--success-color); font-weight: bold;">🔊 Lecture automatique en cours...</small>' : ''}
    `;
    
    if (audioPlayer.src !== window.location.origin + song.path) {
        audioPlayer.src = song.path;
        audioPlayer.load();
        
        // Auto-play dès que le fichier est chargé
        audioPlayer.addEventListener('loadeddata', () => {
            playAudioWithSync(startTime, isPlaying);
        }, { once: true });
    } else {
        // Si c'est déjà le bon fichier, synchroniser directement
        playAudioWithSync(startTime, isPlaying);
    }
}

function playAudioWithSync(startTime, isPlaying) {
    if (startTime && isPlaying) {
        const currentTime = (Date.now() - new Date(startTime).getTime()) / 1000;
        
        // Vérifier que le temps calculé est valide
        if (currentTime >= 0 && currentTime < audioPlayer.duration) {
            audioPlayer.currentTime = currentTime;
        }
        
        // Lancer la lecture automatiquement
        audioPlayer.play().catch(error => {
            console.warn('Autoplay bloqué par le navigateur:', error);
            showStatus('Cliquez n\'importe où pour activer l\'audio', 'warning');
            
            // Permettre l'activation de l'audio au premier clic
            document.addEventListener('click', enableAudio, { once: true });
        });
    }
}

function enableAudio() {
    audioPlayer.play().catch(console.error);
}

function clearCurrentSong() {
    currentSongInfo.innerHTML = '<p>🎵 Aucune musique en cours...</p><small>Ajoutez un fichier MP3 pour commencer !</small>';
    audioPlayer.pause();
    audioPlayer.src = '';
}

function updateQueue(queue) {
    if (queue.length === 0) {
        queueList.innerHTML = '<p class="empty-queue">La file d\'attente est vide</p>';
        return;
    }
    
    queueList.innerHTML = queue.map((song, index) => `
        <div class="queue-item">
            <div class="queue-item-info">
                <h4>${index + 1}. ${song.originalName}</h4>
                <small>Ajouté le ${new Date(song.uploadedAt).toLocaleString()}</small>
            </div>
        </div>
    `).join('');
}

function voteSkip() {
    if (currentRoom) {
        socket.emit('voteSkip', currentRoom);
        showStatus('Vote pour passer enregistré', 'success');
    }
}

// Gestion des fichiers
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

function handleFile(file) {
    if (!currentRoom) {
        showStatus('Veuillez d\'abord rejoindre une salle', 'error');
        return;
    }
    
    if (!file.type.includes('audio/mpeg') && !file.name.toLowerCase().endsWith('.mp3')) {
        showStatus('Seuls les fichiers MP3 sont acceptés', 'error');
        return;
    }
    
    if (file.size > 50 * 1024 * 1024) {
        showStatus('Fichier trop volumineux (max 50MB)', 'error');
        return;
    }
    
    uploadFile(file);
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('mp3file', file);
    
    try {
        uploadStatus.innerHTML = '<p>📤 Upload en cours...</p>';
        
        const response = await fetch(`/upload/${currentRoom}`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            uploadStatus.innerHTML = '<p style="color: var(--success-color);">✅ Fichier uploadé avec succès!</p>';
            showStatus(`Musique ajoutée: ${file.name}`, 'success');
            
            // Reset file input
            fileInput.value = '';
            
            setTimeout(() => {
                uploadStatus.innerHTML = '';
            }, 3000);
        } else {
            throw new Error(result.error || 'Erreur d\'upload');
        }
    } catch (error) {
        console.error('Erreur upload:', error);
        uploadStatus.innerHTML = `<p style="color: var(--error-color);">❌ ${error.message}</p>`;
        showStatus(`Erreur: ${error.message}`, 'error');
    }
}

// Gestion des salles disponibles
async function loadAvailableRooms() {
    try {
        roomsList.innerHTML = '<p class="loading-rooms">Chargement des salles...</p>';
        
        const response = await fetch('/api/rooms');
        const rooms = await response.json();
        
        updateRoomsList(rooms);
    } catch (error) {
        console.error('Erreur lors du chargement des salles:', error);
        roomsList.innerHTML = '<p class="no-rooms">Erreur lors du chargement</p>';
    }
}

function updateRoomsList(rooms) {
    if (rooms.length === 0) {
        roomsList.innerHTML = '<p class="no-rooms">Aucune salle active</p>';
        return;
    }
    
    roomsList.innerHTML = rooms.map(room => `
        <div class="room-item" onclick="joinRoomById('${room.id}')">
            <div class="room-item-info">
                <h4>${room.id}</h4>
                <small>${room.userCount} utilisateur(s) • ${room.currentSong ? `🎵 ${room.currentSong.originalName}` : 'Aucune musique'}</small>
            </div>
            <div class="room-item-actions">
                <button onclick="event.stopPropagation(); joinRoomById('${room.id}')">
                    Rejoindre
                </button>
            </div>
        </div>
    `).join('');
}

function joinRoomById(roomId) {
    roomInput.value = roomId;
    joinRoom();
}

// Gestion de la synchronisation audio
function handleAudioPlay() {
    if (isAudioSyncing) return;
    // L'audio se lance automatiquement, pas besoin d'action spéciale
}

function handleAudioPause() {
    if (isAudioSyncing) return;
    // L'audio est géré automatiquement par le serveur
}

function syncAudioIfNeeded() {
    if (!window.roomStartTime || !window.isRoomPlaying || audioPlayer.paused) {
        return;
    }
    
    const expectedTime = (Date.now() - new Date(window.roomStartTime).getTime()) / 1000;
    const actualTime = audioPlayer.currentTime;
    const timeDiff = Math.abs(expectedTime - actualTime);
    
    // Si la différence est supérieure à 2 secondes, resynchroniser
    if (timeDiff > 2 && expectedTime >= 0 && expectedTime < audioPlayer.duration) {
        console.log(`Resynchronisation: diff de ${timeDiff.toFixed(2)}s`);
        audioPlayer.currentTime = expectedTime;
    }
}

// Utilitaires
function showStatus(message, type = 'info') {
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-message ${type}`;
    statusDiv.textContent = message;
    
    statusMessages.appendChild(statusDiv);
    
    setTimeout(() => {
        statusDiv.remove();
    }, 4000);
}

// Gestion des erreurs globales
window.addEventListener('error', (e) => {
    console.error('Erreur:', e.error);
    showStatus('Une erreur est survenue', 'error');
});

// Prévention de la fermeture accidentelle
window.addEventListener('beforeunload', (e) => {
    if (currentRoom) {
        socket.emit('leaveRoom', currentRoom);
    }
});