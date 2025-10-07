# Configuration des Cookies YouTube

Si vous rencontrez l'erreur "Sign in to confirm you're not a bot" lors du téléchargement de vidéos YouTube, vous devez configurer les cookies.

## Méthode 1: Utilisation automatique des cookies du navigateur

L'application essaie automatiquement d'utiliser les cookies de vos navigateurs installés (Chrome, Firefox, Edge). Assurez-vous d'être connecté à YouTube dans au moins un de ces navigateurs.

## Méthode 2: Configuration manuelle des cookies

### Étape 1: Installer une extension
- **Chrome**: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
- **Firefox**: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

### Étape 2: Exporter les cookies
1. Allez sur [youtube.com](https://youtube.com)
2. Connectez-vous à votre compte YouTube
3. Cliquez sur l'extension installée
4. Sélectionnez "youtube.com" et exportez les cookies
5. Téléchargez le fichier `cookies.txt`

### Étape 3: Remplacer le fichier de cookies
1. Copiez votre fichier `cookies.txt` téléchargé
2. Remplacez le fichier dans: `cookies/youtube_cookies.txt`
3. Redémarrez l'application

## Méthode 3: Utilisation de la ligne de commande

Si vous préférez utiliser la ligne de commande:

```bash
# Exporter les cookies avec yt-dlp
yt-dlp --cookies-from-browser chrome --write-info-json --skip-download "https://www.youtube.com/watch?v=EXAMPLE"

# Ou avec un fichier de cookies spécifique
yt-dlp --cookies cookies/youtube_cookies.txt --extract-audio "https://www.youtube.com/watch?v=EXAMPLE"
```

## Troubleshooting

### Erreur: "Sign in to confirm you're not a bot"
- Assurez-vous d'être connecté à YouTube dans votre navigateur
- Vérifiez que les cookies sont récents (moins de 24h)
- Essayez de vider et recharger les cookies

### Erreur: "Video unavailable"
- La vidéo peut être privée ou géo-bloquée
- Vérifiez que vous avez accès à la vidéo dans votre navigateur

### L'application utilise toujours ytdl-core
- C'est normal ! ytdl-core est plus fiable pour la plupart des vidéos
- yt-dlp n'est utilisé qu'en cas d'échec de ytdl-core

## Notes importantes

- Les cookies contiennent des informations sensibles, ne les partagez pas
- Les cookies expirent, vous devrez les renouveler périodiquement
- L'application essaie automatiquement 4 méthodes différentes pour télécharger