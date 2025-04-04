const { app, BrowserWindow, ipcMain} = require('electron');
require('dotenv').config();
const path = require('path');
const { net } = require('electron');
const { dialog } = require('electron');
const fs = require('fs');
const fst = require('fs').promises;
const { shell } = require('electron');

if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('electron-fiddle', process.execPath, [path.resolve(process.argv[1])]);
    }
    else {
        app.setAsDefaultProtocolClient('electron-fiddle');
    }
}

let mainWindow = null;

function loadExistingPlaylists() {
    // Define the directory where playlists are stored
    // uses appdata from user
    const playlistsDir = path.join(app.getPath('userData'), 'playlists');
    
    if (!fs.existsSync(playlistsDir)) {
        // create file if there is not one
        fs.mkdirSync(playlistsDir, { recursive: true });
    }
    
    try {
        // Read all files in the playlists directory
        const files = fs.readdirSync(playlistsDir);

        const playlists = files
            .filter(file => file.endsWith('.txt'))
            .map(file => path.join(playlistsDir, file));
            
        return playlists;
    } 
    catch (error) {
        console.error('Error loading existing playlists:', error);
        return [];
    }
}


let isSaveDialogOpen = false;
let savedPlaylistFiles = [];

let youtubeApiKey = process.env.YOUTUBE_API_KEY || '';
let spotifyId = process.env.SPOTIFY_CLIENT_ID || '';
let spotifySecret = process.env.SPOTIFY_CLIENT_SECRET || '';
let spotifyRedirect = process.env.SPOTIFY_REDIRECT_URI || '';

let spotifyAccessToken = null;
let spotifyRefreshToken = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 400,
        height: 600,
        webPreferences: {
            preload: path.join(app.getAppPath(), "saved_songs.js"),
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            plugins: true,
            webSecurity: true,
            webviewTag: true,
        },
        resizable: false,
        frame: true,
        minimumWidth: 400,
        maximumWidth: 400,
        minimumHeight: 600,
        maximumHeight: 600
    });

    
    mainWindow.loadFile('index.html');

    mainWindow.on('closed', function () {
        mainWindow = null;
    });

}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
}
else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
                mainWindow.focus();
            }
        }
    })
}


app.on('open-url', (event, twilightrealm) => {
    dialog.showErrorBox('Welcome Back', 'You arrived from: ${twilightrealm');
});


app.whenReady().then(() => {
    createWindow();
    savedPlaylistFiles = loadExistingPlaylists();
});




app.on('will-quit', async (event) => {
    console.log('Application will quit - pausing Spotify if active');
    
    if (spotifyAccessToken) {
        event.preventDefault();
        try {
            const result = await pauseSpotifyPlayback();
            console.log('Spotify pause result:', result);
            app.exit(0);
        } 
        catch (error) {
            console.error('Error pausing Spotify on app exit:', error);
            app.exit(0);
        }
    }
});


// YouTube API handler
ipcMain.handle('search-youtube', async (event, query) => {
    try {
        if (!youtubeApiKey) {
            return { error: 'YouTube API key not configured' };
        }

        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoEmbeddable=true&maxResults=10&key=${youtubeApiKey}`;
        
        return new Promise((resolve, reject) => {
            const request = net.request(url);
            
            let responseData = '';
            
            request.on('response', (response) => {
                response.on('data', (chunk) => {
                    responseData += chunk.toString();
                });
                
                response.on('end', () => {
                    try {
                        const data = JSON.parse(responseData);
                        resolve(data);
                    } 
                    catch (e) {
                        reject(e);
                    }
                });
            });
            
            request.on('error', (error) => {
                reject(error);
            });
            
            request.end();
        });
    } 
    catch (error) {
        console.error('Error searching YouTube:', error);
        return { error: error.message };
    }
});


async function pauseSpotifyPlayback() {
    if (!spotifyAccessToken) {
        console.log('No Spotify access token available');
        return false;
    }
    
    console.log('Attempting to pause Spotify on app close');
    
    return new Promise((resolve, reject) => {
        const request = net.request({
            method: 'PUT',
            url: 'https://api.spotify.com/v1/me/player/pause',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });
        
        request.on('response', (response) => {
            console.log(`Spotify pause response status: ${response.statusCode}`);

            if (response.statusCode === 204) {
                resolve(true);
            } 
            else {
                let responseData = '';
                
                response.on('data', (chunk) => {
                    responseData += chunk.toString();
                });
                
                response.on('end', () => {
                    console.error('Error pausing Spotify:', responseData);
                    resolve(false);
                });
            }
        });
        
        request.on('error', (error) => {
            console.error('Network error pausing Spotify:', error);
            resolve(false);
        });
        request.end();
    });
}

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});


// Spotify Authentication
ipcMain.handle('spotify-auth', async () => {
    try {
        if (!spotifyId || !spotifyRedirect) {
            return { error: 'Spotify credentials not configured' };
        }
        
        const scope = 'streaming user-read-email user-read-private user-library-read user-library-modify user-read-playback-state user-modify-playback-state';
        const authUrl = `https://accounts.spotify.com/authorize?client_id=${spotifyId}&response_type=code&redirect_uri=${encodeURIComponent(spotifyRedirect)}&scope=${encodeURIComponent(scope)}`;
        
        const authWindow = new BrowserWindow({
            width: 400,
            height: 600,
            webPreferences: {
                nodeIntegration: false
            },
            parent: mainWindow,     // new window is now the child
            modal: true             // prevent interaction with main window
        });
        
        authWindow.loadURL(authUrl);
        
        return new Promise((resolve, reject) => {
            authWindow.webContents.on('will-redirect', async (event, url) => {
                const urlObj = new URL(url);
                const code = urlObj.searchParams.get('code');
                
                if (code) {
                    try {
                        // Exchange code for tokens
                        const tokenResponse = await getSpotifyTokens(code);
                        spotifyAccessToken = tokenResponse.access_token;
                        spotifyRefreshToken = tokenResponse.refresh_token;
                        
                        authWindow.close();
                        // Return the access token to the renderer
                        resolve({ 
                            success: true,
                            token: spotifyAccessToken 
                        });
                    } 
                    catch (error) {
                        reject(error);
                    }
                }
            });
        });
    } 
    catch (error) {
        console.error('Spotify auth error:', error);
        return { error: error.message };
    }
});

// Get Spotify tokens
async function getSpotifyTokens(code) {
    console.log('Getting Spotify tokens with code');
    
    try {
        const data = `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(spotifyRedirect)}&client_id=${spotifyId}&client_secret=${spotifySecret}`;
        
        console.log('Sending token request to Spotify API');
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: data
        });
        
        const responseText = await response.text();
        console.log('Token response status:', response.status);
        
        if (response.status !== 200) {
            console.error('Token request failed with status:', response.status);
            console.error('Response body:', responseText);
            return { 
                error: `Authentication failed (${response.status})`, 
                details: responseText 
            };
        }
        
        try {
            const tokenData = JSON.parse(responseText);
            return tokenData;
        } 
        catch (e) {
            console.error('Error parsing token response:', e);
            console.log('Raw response:', responseText);
            return { 
                error: 'Invalid response format from Spotify',
                details: responseText
            };
        }
    } 
    catch (error) {
        console.error('Error in getSpotifyTokens:', error);
        return { 
            error: error.message,
            details: 'Network or server error'
        };
    }
}


// Handle Spotify token refresh
async function refreshSpotifyToken() {
    if (!spotifyRefreshToken) return false;
    
    try {
        const data = `grant_type=refresh_token&refresh_token=${spotifyRefreshToken}&client_id=${spotifyId}&client_secret=${spotifySecret}`;
        
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: data
        });
        
        const tokenData = await response.json();
        
        if (tokenData.access_token) {
            spotifyAccessToken = tokenData.access_token;
            if (tokenData.refresh_token) {
                spotifyRefreshToken = tokenData.refresh_token;
            }
            return true;
        }
        return false;
    } 
    catch (error) {
        console.error('Error refreshing token:', error);
        return false;
    }
}

async function refreshAndRetrySpotifyRequest(requestFunction, ...args) {
    const refreshed = await refreshSpotifyToken();
    if (refreshed) {
        return requestFunction(...args);
    } 
    else {
        return { error: 'Failed to refresh Spotify token' };
    }
}

// Spotify Search
ipcMain.handle('search-spotify', async (event, query) => {
    if (!spotifyAccessToken) {
        return { error: 'Not authenticated with Spotify' };
    }
    
    try {
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });
        
        if (response.status === 401) {
            // Token expired, use the centralized refresh function
            return refreshAndRetrySpotifyRequest(
                (q) => ipcMain.invoke('search-spotify', event, q), 
                query
            );
        }
        
        return response.json();
    } 
    catch (error) {
        console.error('Error searching Spotify:', error);
        return { error: error.message };
    }
});

// Play Spotify track
ipcMain.handle('play-spotify-track', async (event, trackUri) => {
    if (!spotifyAccessToken) {
        return { error: 'Not authenticated with Spotify' };
    }
    
    try {
        const deviceResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });
        
        const deviceData = await deviceResponse.json();
        console.log('Available devices:', deviceData);
        
        if (!deviceData.devices || deviceData.devices.length === 0) {
            return { error: 'No active Spotify devices found. Please open Spotify on a device first.' };
        }
        
        // Use the first available device
        const deviceId = deviceData.devices[0].id;
        
        // Play on the selected device
        const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                uris: [trackUri]
            })
        });
        
        if (response.status === 204) {
            return { success: true };
        } 
        else if (response.status === 401) {
            const refreshed = await refreshSpotifyToken();
            if (refreshed) {
                return ipcMain.handle('play-spotify-track', event, trackUri);
            }
        } 
        else {
            const errorBody = await response.text();
            return { error: `Failed to play track: ${response.status} - ${errorBody}` };
        }
        
        return { error: `Failed to play track: ${response.status}` };
    } 
    catch (error) {
        console.error('Error playing Spotify track:', error);
        return { error: error.message };
    }
});


// Pause Spotify playback
ipcMain.handle('pause-spotify', async () => {
    if (!spotifyAccessToken) return { error: 'Not authenticated' };
    
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/pause', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });
        
        return { success: response.status === 204 };
    } 
    catch (error) {
        return { error: error.message };
    }
});

// Resume Spotify playback
ipcMain.handle('resume-spotify', async () => {
    if (!spotifyAccessToken) return { error: 'Not authenticated' };
    
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });
        
        return { success: response.status === 204 };
    } 
    catch (error) {
        return { error: error.message };
    }
});

// Get Spotify playback state
ipcMain.handle('get-spotify-playback-state', async () => {
    if (!spotifyAccessToken) return { error: 'Not authenticated' };
    
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player', {
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });
        
        if (response.status === 204) {
            return { is_playing: false };
        }
        
        return response.json();
    } 
    catch (error) {
        return { error: error.message };
    }
});

// Set Spotify volume
ipcMain.handle('set-spotify-volume', async (event, volumePercent) => {
    if (!spotifyAccessToken) return { error: 'Not authenticated' };
    
    try {
        const response = await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${Math.min(100, Math.max(0, volumePercent))}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });
        
        return { success: response.status === 204 };
    } 
    catch (error) {
        return { error: error.message };
    }
});


ipcMain.handle('play-spotify-at-position', async (event, { uri, position_ms }) => {
    try {
        const accessToken = getSpotifyToken(); // Get your stored token
        
        // Make sure we have a valid token
        if (!accessToken) {
            return { success: false, error: 'No access token available' };
        }
        
        // Call the Spotify Web API to play a specific URI at a specific position
        const response = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                uris: [uri],
                position_ms: position_ms 
            })
        });

        if (response.status === 204) {
            return { success: true };
        } 
        else {
            const errorData = await response.json();
            return { success: false, error: errorData.error?.message || 'Unknown error' };
        }
    } 
    catch (error) {
        console.error('Error in play-spotify-at-position:', error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle('seek-spotify', async (event, positionMs) => {
    try {
        const response = await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });
        
        if (response.status === 204) {
            return { success: true };
        } 
        else {
            const errorData = await response.text();
            return { success: false, error: `API Error: ${response.status} - ${errorData}` };
        }
    } 
    catch (error) {
        return { success: false, error: error.message };
    }
});


ipcMain.on('create-document-triggered', () => {

    if (isSaveDialogOpen) {
        console.log('Save dialog is already open');
        return;
    }

    isSaveDialogOpen = true;
    const playlistsDir = path.join(app.getPath('userData'), 'playlists');

    dialog.showSaveDialog(mainWindow, {
        title: 'Create New Playlist',
        defaultPath: path.join(playlistsDir, 'New Playlist.txt'),
        filters: [{ name: "text files", extensions: ["txt"]}]
    }).then(({ filePath, cancelled }) => {
        isSaveDialogOpen = false;

        if (cancelled || !filePath) {
            console.log('No file was created');
            return;
        }

        console.log('file path', filePath);
        fs.writeFile(filePath, "", (error) => {
            if (error) {
                console.log("error in text file");
            }
            else {
                const filename = path.basename(filePath);

                if (!savedPlaylistFiles.includes(filePath)) {
                    savedPlaylistFiles.push(filePath);
                }

                mainWindow.webContents.send("document-created", {
                    path: filePath,
                    name: filename,
                    allPlaylists: savedPlaylistFiles
                });
            }
        });
    });

});


// for playlist function
ipcMain.handle('get-saved-playlists', () => {
    return savedPlaylistFiles;
});

ipcMain.handle('save-song-to-playlist', async (event, { playlistPath, songData }) => {
    try {
        // Check if the playlist file exists
        if (!fs.existsSync(playlistPath)) {
            return { success: false, error: 'Playlist does not exist' };
        }
        
        // Append the song data to the playlist file
        fs.appendFile(playlistPath, songData, (err) => {
            if (err) {
                console.error('Error saving song to playlist:', err);
                return { success: false, error: err.message };
            }
        });
        
        return { success: true };
    } 
    catch (error) {
        console.error('Error in save-song-to-playlist handler:', error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle('read-playlist', async (event, playlistPath) => {
    try {
        const content = await fst.readFile(playlistPath, 'utf8');
        return content;
    } 
    catch (error) {
        console.error('Error reading playlist file:', error);
        throw new Error(`Could not read playlist: ${error.message}`);
    }
});

ipcMain.on('open-file', (event, filePath) => {
    try {
        shell.openPath(filePath)
            .then(errorMessage => {
                if (errorMessage) {
                    console.error('Error opening file:', errorMessage);
                }
            });
    } 
    catch (error) {
        console.error('Error opening file:', error);
    }
});

ipcMain.on('quit-app', () => {
    setTimeout(() => {
        app.quit();
    }, 1300);

});

ipcMain.on('reload-app', () => {
    if (mainWindow) {
        console.log('Reloading application window');
        mainWindow.reload();
    }
});

