let spotifyPlayer = null;
let spotifyToken = null;
let spotifyDeviceId = null;
let spotifySearchResults = [];
let spotifyIsPlaying = false;
let spotifyCurrentTrack = null;
let spotifyProgressInterval = null;
let currentSpotifyIndex = -1;
let spotifyHistory = [];

let spotifyVolume = 50;

// Global API mode
window.appState = window.appState || {};
window.appState.currentApiMode = 'youtube';

async function getSpotifyPlayback() {
    if (!spotifyToken) {
        console.error("No spotify toek detected");
        return;
    }
}


async function authenticateSpotify() {
    try {
        console.log('Starting Spotify authentication...');
        document.getElementById('song-title').classList.remove('hidden');
        document.getElementById('song-title').textContent = 'Connecting to Spotify...';
        
        const result = await ipcRenderer.invoke('spotify-auth');
        console.log('Spotify auth result:', result);
        
        if (result.success && result.token) {
            console.log('Spotify Authentication Successful');
            spotifyToken = result.token;

            // Use the token with Web API
            console.log('Spotify connected (API mode)');
            document.getElementById('song-title').textContent = 'Control your spotify remotely! Must have it open on a device';
            updateControlButtonListeners();
            return true;
        }
        console.error('Spotify Authentication Failed with unknown error');
        document.getElementById('song-title').textContent = 'Spotify Auth Failed';
        return false;
    }
    catch (error) {
        console.error('Error during authentication:', error);
        document.getElementById('song-title').textContent = 'Spotify Auth Error: ' + error.message;
        return false;
    }

    // await authenticateSpotify();
    // updateControlButtonListeners();
}


// initialize spotify player
function initializeSpotifyPlayer() {
    if (!spotifyToken) {
        console.error('Cannot initialize Spotify player: No token available');
        document.getElementById('song-title').textContent = 'No Spotify token available';
        return;
    }

    // Verify SDK is available
    if (typeof Spotify === 'undefined') {
        console.error('Spotify SDK not available - failed to load');
        document.getElementById('song-title').textContent = 'Spotify SDK not available';
        return;
    }

    try {
        console.log('Initializing Spotify player...');
        document.getElementById('song-title').textContent = 'Initializing Spotify player...';

        if (spotifyPlayer) {
            console.log('Disconnecting existing player before creating a new one');
            spotifyPlayer.disconnect();
        }

        spotifyPlayer = new Spotify.Player({
            name: 'Twilight Player',
            getOAuthToken: cb => { cb(spotifyToken); },
            volume: 0.7
        });

        console.log('Player object created:', spotifyPlayer ? 'Success' : 'Failed');

        // Event listeners
        spotifyPlayer.addListener('initialization_error', ({ message }) => {
            console.error('Spotify Player initialization error:', message);
            document.getElementById('song-title').textContent = 'Player init error: ' + message;
        });
        
        spotifyPlayer.addListener('authentication_error', ({ message }) => {
            console.error('Spotify Player authentication error:', message);
            document.getElementById('song-title').textContent = 'Auth error: ' + message;
        });
        
        spotifyPlayer.addListener('account_error', ({ message }) => {
            console.error('Spotify Player account error:', message);
            document.getElementById('song-title').textContent = 'Account error: ' + message;
        });
        
        spotifyPlayer.addListener('playback_error', ({ message }) => {
            console.error('Spotify Player playback error:', message);
            document.getElementById('song-title').textContent = 'Playback error: ' + message;
        });

        // Playback status updates
        spotifyPlayer.addListener('player_state_changed', state => {
            console.log('Player state changed:', state);
            if (!state) {
                console.log('State is null or undefined');
                return;
            }
            
            spotifyIsPlaying = !state.paused;
            updateSpotifyPlayPauseButton();
            
            if (state.track_window && state.track_window.current_track) {
                const track = state.track_window.current_track;
                document.getElementById('song-title').textContent = `${track.name} - ${track.artists[0].name}`;
                
                // Update image if available
                if (track.album && track.album.images && track.album.images.length > 0) {
                    document.getElementById('imagebox').style.backgroundImage = `url(${track.album.images[0].url})`;
                }
                
                // Update current track info
                spotifyCurrentTrack = {
                    uri: track.uri,
                    id: track.id,
                    name: track.name,
                    artists: track.artists.map(artist => ({ name: artist.name })),
                    album: {
                        images: track.album.images
                    }
                };
            }
            
            // Update progress
            if (spotifyIsPlaying) {
                startSpotifyProgressTracking();
            } 
            else {
                clearInterval(spotifyProgressInterval);
            }
        });

        spotifyPlayer.addListener('ready', ({ device_id }) => {
            console.log('Spotify Player Ready with Device ID:', device_id);
            spotifyDeviceId = device_id;
            document.getElementById('song-title').textContent = 'Spotify connected';
        });

        spotifyPlayer.addListener('not_ready', ({ device_id }) => {
            console.warn('Spotify Player device has gone offline:', device_id);
            if (spotifyDeviceId === device_id) {
                spotifyDeviceId = null;
            }
            document.getElementById('song-title').textContent = 'Spotify device offline';
        });

        // Connect to player
        spotifyPlayer.connect()
            .then(success => {
                if (success) {
                    console.log('Spotify Player successfully connected');
                } else {
                    console.error('Spotify Player failed to connect');
                    document.getElementById('song-title').textContent = 'Failed to connect to Spotify';
                }
            })
            .catch(error => {
                console.error('Error connecting to Spotify player:', error);
                document.getElementById('song-title').textContent = 'Error connecting to Spotify';
            });
    } 
    catch (error) {
        console.error('Error initializing Spotify player:', error);
        document.getElementById('song-title').textContent = 'Spotify player init error' + error.message;
    }
}


// Search spotify songs
async function searchSpotifySongs(query) {
    if (!query) {
        return;
    }

    try {
        document.getElementById('song-title').textContent = 'Searching Spotify...';

        const data = await ipcRenderer.invoke('search-spotify', query);

        if (data.error) {
            console.error('Spotify search error:', data.error);
            document.getElementById('song-title').textContent = 'Spotify search error';
            return;
        }
        
        if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
            spotifySearchResults = data.tracks.items;
            displaySpotifySearchResults(spotifySearchResults);
            document.getElementById('song-title').textContent = 'Select a song';
        }
        else {
            document.getElementById('song-title').textContent = 'No Spotify results found';
            spotifySearchResults = [];
            document.getElementById('search-results').innerHTML = '';
            document.getElementById('search-results').classList.add('hidden');
        }
    }
    catch (error) {
        console.error('Error searching Spotify songs:', error);
        document.getElementById('song-title').textContent = 'Spotify search failed';
    }
}


// Display search results
function displaySpotifySearchResults(results) {
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '';

    if (results.length === 0) {
        resultsContainer.classList.add('hidden');
        return;
    }

    resultsContainer.classList.remove('hidden');
    
    results.forEach((result, index) => {
        const resultItem = document.createElement('div');
        resultItem.className = 'search-result';
        resultItem.textContent = `${result.name} - ${result.artists[0].name}`;

        resultItem.addEventListener('click', () => {
            playSpotifySong(index);
            resultsContainer.classList.add('hidden');
        });
        
        resultsContainer.appendChild(resultItem);
    });
}


// play song through API using existing IPC handlers
async function playSpotifySong(index) {
    if (!spotifySearchResults[index]) {
        return;
    }

    const selectedTrack = spotifySearchResults[index];
    
    // Update history
    if (spotifyCurrentTrack && currentSpotifyIndex !== -1 && spotifySearchResults[currentSpotifyIndex]) {
        addToSpotifyHistory(spotifySearchResults[currentSpotifyIndex]);
    }
    
    spotifyCurrentTrack = selectedTrack;
    currentSpotifyIndex = index;
    
    // Update UI elements
    const songTitle = document.getElementById('song-title');
    songTitle.classList.remove('hidden');
    songTitle.textContent = `${selectedTrack.name} - ${selectedTrack.artists[0].name}`;
    
    // Update imagebox
    let imageUrl = selectedTrack.album.images[0]?.url || './images/midna.jpg';
    document.getElementById('imagebox').style.backgroundImage = `url(${imageUrl})`;
    
    try {
        const result = await ipcRenderer.invoke('play-spotify-track', selectedTrack.uri);
        
        if (result.success) {
            spotifyIsPlaying = true;
            updateSpotifyPlayPauseButton();
            startSpotifyProgressTracking();
        } 
        else {
            console.error('Error playing track:', result.error);
            songTitle.textContent = `Error: ${result.error || 'Unknown error'}`;
        }
    } 
    catch (error) {
        console.error('Error playing track:', error);
        songTitle.textContent = 'Error playing track';
    }
    
    updateSpotifyQueue();
}


async function playNextSpotifySong() {
    if (currentSpotifyIndex < spotifySearchResults.length - 1) {
        // Add current song to history before moving to next
        if (spotifyCurrentTrack && currentSpotifyIndex !== -1) {
            addToSpotifyHistory(spotifySearchResults[currentSpotifyIndex]);
        }
        
        await playSpotifySong(currentSpotifyIndex + 1);
    } 
    else {
        console.log('No more songs in queue');
    }
}

async function playPreviousSpotifySong() {
    if (currentSpotifyIndex > 0) {
        await playSpotifySong(currentSpotifyIndex - 1);
    } 
    else {
        console.log('At the beginning of queue');
    }
}

async function toggleSpotifyPlayPause() {
    console.log('Toggle play/pause called. Current state:', spotifyIsPlaying);
    
    if (!spotifyCurrentTrack) {
        console.log('No current track to play/pause');
        return;
    }

    try {
        const currentState = await ipcRenderer.invoke('get-spotify-playback-state');
        console.log('Current playback state from API:', currentState);

        if (!currentState || currentState.error || currentState.status === 204) {
            console.log('No active playback or device found');

            if (spotifyCurrentTrack) {
                console.log('Attempting to restart playback with current track');
                
                try {
                    const playResult = await ipcRenderer.invoke('play-spotify-track', spotifyCurrentTrack.uri);
                    
                    if (playResult.success) {
                        spotifyIsPlaying = true;
                        startSpotifyProgressTracking();
                        updateSpotifyPlayPauseButton();
                    } 
                    else {
                        console.error('Failed to restart playback:', playResult.error || 'Unknown error');
                    }
                } 
                catch (restartError) {
                    console.error('Error restarting playback:', restartError);
                }
            }
            return;
        }

        const currentPositionMs = currentState.progress_ms;
        
        if (currentState.is_playing) {
            console.log('Attempting to pause Spotify');
            
            try {
                const result = await ipcRenderer.invoke('pause-spotify');
                console.log('Pause result:', result);
                
                if (result.success) {
                    spotifyIsPlaying = false;
                    clearInterval(spotifyProgressInterval);
                    updateSpotifyPlayPauseButton();
                } 
                else {
                    console.error('Failed to pause:', result.error || 'Unknown error');
                }
            } 
            catch (pauseError) {
                console.error('Error pausing playback:', pauseError);
            }
        } 
        else {
            console.log('Attempting to resume Spotify');
            
            try {
                const result = await ipcRenderer.invoke('resume-spotify');
                console.log('Resume result:', result);
                
                if (result.success) {
                    spotifyIsPlaying = true;
                    startSpotifyProgressTracking();
                    updateSpotifyPlayPauseButton();
                } 
                else {
                    console.error('Failed to resume Spotify playback:', result.error);
                    console.log('Resume failed, trying position-based playback at:', currentPositionMs);
                
                    try {
                        const seekResult = await ipcRenderer.invoke('play-spotify-at-position', {
                            uri: spotifyCurrentTrack.uri,
                            position_ms: currentPositionMs
                        });
                        
                        if (seekResult.success) {
                            spotifyIsPlaying = true;
                            startSpotifyProgressTracking();
                            updateSpotifyPlayPauseButton();
                        } else {
                            console.error('Failed to play at position:', seekResult.error || 'Unknown error');
                        }
                    } 
                    catch (seekError) {
                        console.error('Failed to play at position:', seekError);
                    }
                }
            } 
            catch (resumeError) {
                console.error('Error resuming playback:', resumeError);
            }
        }
    } 
    catch (error) {
        console.error('Error toggling Spotify playback:', error);
    }
}


function updateSpotifyPlayPauseButton() {
    try {
        const pauseButton = document.getElementById('pause-button');

        if (!pauseButton) {
            console.error('Pause button not found when updating');
            return;
        }
        console.log('Updating play/pause button to:', spotifyIsPlaying ? 'Pause' : 'Play');
        pauseButton.textContent = spotifyIsPlaying ? '❚❚' : '▶';
    } 
    catch (error) {
        console.error('Error updating play/pause button:', error);
    }
}

function startSpotifyProgressTracking() {
    try {
        clearInterval(spotifyProgressInterval);
        updateSpotifyProgress();
        spotifyProgressInterval = setInterval(updateSpotifyProgress, 1000);
    } 
    catch (error) {
        console.error('Error starting progress tracking:', error);
    }
}

async function updateSpotifyProgress() {
    try {
        if (!spotifyCurrentTrack) {
            console.log('No current track, skipping progress update');
            return;
        }

        const playbackState = await ipcRenderer.invoke('get-spotify-playback-state');
        
        if (!playbackState || playbackState.status === 204) {
            console.log('No active playback found');
            spotifyIsPlaying = false;
            updateSpotifyPlayPauseButton();
            clearInterval(spotifyProgressInterval);
            return;
        }

        if (playbackState.error) {
            console.error('Error getting playback state:', playbackState.error);
            return;
        }
        
        if (playbackState.is_playing !== spotifyIsPlaying) {
            console.log(`Updating play state from ${spotifyIsPlaying} to ${playbackState.is_playing}`);
            spotifyIsPlaying = playbackState.is_playing;
            updateSpotifyPlayPauseButton();
            
            if (!spotifyIsPlaying) {
                clearInterval(spotifyProgressInterval);
            }
        }
        
        if (playbackState.item) {
            const trackChanged = !spotifyCurrentTrack || playbackState.item.id !== spotifyCurrentTrack.id;
            
            if (trackChanged) {
                spotifyCurrentTrack = playbackState.item;

                const songTitle = document.getElementById('song-title');
                if (songTitle) {
                    songTitle.textContent = `${playbackState.item.name} - ${playbackState.item.artists[0].name}`;
                    songTitle.classList.remove('hidden');
                }

                const imageBox = document.getElementById('imagebox');
                if (imageBox && playbackState.item.album && 
                    playbackState.item.album.images && 
                    playbackState.item.album.images.length > 0) {
                    imageBox.style.backgroundImage = `url(${playbackState.item.album.images[0].url})`;
                }

                currentSpotifyIndex = spotifySearchResults.findIndex(track => track.id === playbackState.item.id);
                if (currentSpotifyIndex === -1 && playbackState.item) {
                    spotifySearchResults.push(playbackState.item);
                    currentSpotifyIndex = spotifySearchResults.length - 1;
                }

                updateSpotifyQueue();
            }

            const currentTime = playbackState.progress_ms / 1000;
            const duration = playbackState.item.duration_ms / 1000;
            const progressPercent = (currentTime / duration) * 100;
            
            const progressCurrent = document.getElementById('progress-current');
            const currentTimeEl = document.getElementById('current-time');
            const durationEl = document.getElementById('duration');
            
            if (progressCurrent) {
                progressCurrent.style.width = `${progressPercent}%`;
            }
            
            if (currentTimeEl) {
                currentTimeEl.textContent = formatSpotifyTime(currentTime);
            }
            
            if (durationEl) {
                durationEl.textContent = formatSpotifyTime(duration - currentTime);
            }

            if (duration > 0 && currentTime >= duration - 1 && currentSpotifyIndex < spotifySearchResults.length - 1) {
                console.log('Song ending, playing next song');
                clearInterval(spotifyProgressInterval);
                setTimeout(() => playNextSpotifySong(), 500);
            }
        }
    } 
    catch (error) {
        console.error('Error updating Spotify progress:', error);
    }
}

function formatSpotifyTime(timeInSeconds) {
    if (isNaN(timeInSeconds)) {
        return '0:00';
    }
    
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateSpotifyVolume(amount) {
    spotifyVolume = Math.max(0, Math.min(100, spotifyVolume + amount));

    ipcRenderer.invoke('set-spotify-volume', spotifyVolume)
        .then(() => console.log(`Spotify volume set to ${spotifyVolume}`))
        .catch(err => console.error('Error setting Spotify volume:', err));
}

function addToSpotifyHistory(track) {
    if (spotifyHistory.length === 0 || spotifyHistory[0].id !== track.id) {
        spotifyHistory.unshift(track);
    }
    
    // if (spotifyHistory.length > MAX_HISTORY_LENGTH) {
    //     spotifyHistory.pop();
    // }
    
    updateSpotifyQueue();
}

// update spotify queue
function updateSpotifyQueue() {
    try {
        const nextSong = document.getElementById('play-next');
        const pastSongs = document.getElementById('past-songs');
        
        if (!nextSong || !pastSongs) {
            console.error('Queue elements not found');
            return;
        }
        
        // Update next song
        if (currentSpotifyIndex < spotifySearchResults.length - 1) {
            const nextSongData = spotifySearchResults[currentSpotifyIndex + 1];
            nextSong.textContent = `${nextSongData.name} - ${nextSongData.artists[0].name}`;
        } 
        else {
            nextSong.textContent = 'No song in queue';
        }
        
        // Update history
        if (spotifyHistory.length > 0) {
            pastSongs.innerHTML = '';
            spotifyHistory.forEach(track => {
                const historyItem = document.createElement('div');
                historyItem.textContent = `${track.name} - ${track.artists[0].name}`;
                historyItem.className = 'history-item';
                
                historyItem.addEventListener('click', () => {
                    const index = spotifySearchResults.findIndex(s => s.id === track.id);
                    if (index !== -1) {
                        playSpotifySong(index);
                    } 
                    else {
                        spotifySearchResults.push(track);
                        playSpotifySong(spotifySearchResults.length - 1);
                    }
                });
                
                pastSongs.appendChild(historyItem);
            });
        } 
        else {
            pastSongs.textContent = 'No Spotify song history';
        }
    } 
    catch (error) {
        console.error('Error updating queue:', error);
    }
}

function setupSpotifyProgressBarInteraction() {
    const progressBar = document.getElementById('progress-bar');
    
    if (!progressBar) {
        console.error('Progress bar not found');
        return;
    }
    
    progressBar.addEventListener('click', async (e) => {

        if (window.appState.currentApiMode !== 'spotify') {
            return;
        }

        if (!spotifyToken || !spotifyCurrentTrack) {
            console.log('No Spotify token or current track, ignoring progress bar click');
            return;
        }
        
        try {
            console.log('Progress bar clicked, getting playback state');
            
            const playbackState = await ipcRenderer.invoke('get-spotify-playback-state');
            
            if (!playbackState || playbackState.error || !playbackState.item) {
                console.error('Could not get track duration', playbackState?.error || 'No playback state');
                return;
            }
            
            const rect = progressBar.getBoundingClientRect();
            const clickPosition = (e.clientX - rect.left) / rect.width;
            const seekToMs = Math.round(playbackState.item.duration_ms * clickPosition);
            
            console.log(`Seeking to ${seekToMs}ms (${clickPosition * 100}% of track)`);
            
            // instant response
            const duration = playbackState.item.duration_ms / 1000;
            const newTime = seekToMs / 1000;
            
            const progressCurrent = document.getElementById('progress-current');
            const currentTimeEl = document.getElementById('current-time');
            const durationEl = document.getElementById('duration');
            
            if (progressCurrent) {
                progressCurrent.style.width = `${clickPosition * 100}%`;
            }
            
            if (currentTimeEl) {
                currentTimeEl.textContent = formatSpotifyTime(newTime);
            }
            
            if (durationEl) {
                durationEl.textContent = formatSpotifyTime(duration - newTime);
            }

            const seekResult = await ipcRenderer.invoke('seek-spotify', seekToMs);

            if (seekResult.success) {
                console.log('Seek successful');
            } 
            else {
                console.error('Error seeking:', seekResult.error);
            }
            
            const response = await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${seekToMs}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${spotifyToken}`
                }
            });
            
            if (response.status === 204) {
                console.log('Seek successful');
            } 
            else {
                console.error('Error seeking:', response.status);
                const errorText = await response.text();
                console.error('Error details:', errorText);
            }
        } 
        catch (error) {
            console.error('Error in progress bar click handler:', error);
        }
    });
}

// Switch which API is being used
function switchAPI(apiMode) {
    // if api is not spotify or youtube
    if (apiMode !== 'youtube' && apiMode !== 'spotify') {
        console.error('Invalid API mode:', apiMode);
        return;
    }

    //  reset progress bar
    clearInterval(spotifyProgressInterval);

    // stop current audio
    if (window.appState.currentApiMode === 'spotify' && spotifyIsPlaying) {
        console.log('Stopping Spotify playback before switching APIs');
        ipcRenderer.invoke('pause-spotify')
            .then(result => {
                console.log('Spotify pause result:', result);
                spotifyIsPlaying = false;
                updateSpotifyPlayPauseButton();
            })
            .catch(error => {
                console.error('Error pausing Spotify:', error);
            });
    } 
    else if (window.appState.currentApiMode === 'youtube' && typeof player !== 'undefined' && typeof isPlaying !== 'undefined' && isPlaying) {
        console.log('Stopping YouTube playback before switching APIs');
        player.pauseVideo();
    }

    document.getElementById('progress-current').style.width = '0%';
    document.getElementById('current-time').textContent = '0:00';
    document.getElementById('duration').textContent = '0:00';

    window.appState.currentApiMode = apiMode;

    const apiButton = document.getElementById('switchApi');
    const apiElement = document.getElementById('apiDisplay');

    updateControlButtonListeners();

    if (window.appState.currentApiMode === 'spotify') {
        apiButton.textContent = 'Switch to YouTube';
        apiElement.textContent = 'Spotify Control Ver. 1.0.0';
        document.getElementById('imagebox').style.backgroundImage = `url(./images/wolf_link.jpg)`;

        updateControlButtonListeners();
        
        // Initialize Spotify just in case
        authenticateSpotify()
            .then(success => {
                if (!success) {
                    console.error('Failed to authenticate with Spotify');
                    window.appState.currentApiMode = 'youtube';
                    apiElement.textContent = 'spotify API';
                    apiButton.textContent = 'Spotify Remote Control';
                    apiElement.textContent = 'Youtube Ver. 1.0.0';
                }
            })
            .catch(err => {
                console.error('Spotify authentication error:', err);
                
                window.appState.currentApiMode = 'youtube';
                apiButton.textContent = 'Spotify Remote Control';
                apiElement.textContent = 'Youtube Ver. 1.0.0';
            });
    }
    else {
        apiButton.textContent = 'Spotify Remote Control';
        apiElement.textContent = 'Youtube Ver. 1.0.0';
        document.getElementById('imagebox').style.backgroundImage = `url(./images/midna.jpg)`;
    }

    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-results').classList.add('hidden');
    
    document.getElementById('song-title').textContent = 'No song playing';
    document.getElementById('song-title').classList.add('hidden');
    
    updateSearchBarBehavior();
    
    console.log(`Switched to ${window.appState.currentApiMode} API mode`);
}


// replace buttons with new buttons for spotify function
function updateControlButtonListeners() {

    console.log('Updating control button listeners for mode:', window.appState.currentApiMode);
    

    // new UI
    const pauseButton = document.getElementById('pause-button');
    const nextButton = document.getElementById('next-button');
    const prevButton = document.getElementById('prev-button');

    const volumeDownButton = document.getElementById('volume-down');
    const volumeUpButton = document.getElementById('volume-up');

    const backButton = document.getElementById('back');
    const queueButton = document.getElementById('queue');
    
    if (!pauseButton || !nextButton || !prevButton) {
        console.error('One or more control buttons not found in the DOM');
        return;
    }
    

    // clone
    const newPauseButton = pauseButton.cloneNode(true);
    const newNextButton = nextButton.cloneNode(true);
    const newPrevButton = prevButton.cloneNode(true);

    const newVolumeUpButton = volumeUpButton.cloneNode(true);
    const newVolumeDownButton = volumeDownButton.cloneNode(true);

    const newBackButton = backButton.cloneNode(true);
    const newQueueButton = queueButton.cloneNode(true);
    

    // replace
    pauseButton.parentNode.replaceChild(newPauseButton, pauseButton);
    nextButton.parentNode.replaceChild(newNextButton, nextButton);
    prevButton.parentNode.replaceChild(newPrevButton, prevButton);

    volumeUpButton.parentNode.replaceChild(newVolumeUpButton, volumeUpButton);
    volumeDownButton.parentNode.replaceChild(newVolumeDownButton, volumeDownButton);

    backButton.parentNode.replaceChild(newBackButton, backButton);
    queueButton.parentNode.replaceChild(newQueueButton, queueButton);
    
    if (window.appState.currentApiMode === 'spotify') {
        console.log('Setting up Spotify control buttons');

        document.getElementById('pause-button').addEventListener('click', function() {
            console.log('Spotify pause button clicked');
            toggleSpotifyPlayPause();
        });
        
        document.getElementById('next-button').addEventListener('click', function() {
            console.log('Spotify next button clicked');
            playNextSpotifySong();
        });
        
        document.getElementById('prev-button').addEventListener('click', function() {
            console.log('Spotify previous button clicked');
            playPreviousSpotifySong();
        });

        document.getElementById('back').addEventListener('click', () => {
            document.getElementById('imagebox').classList.remove('hidden');
            document.getElementById('progress-container').classList.remove('hidden');
            document.getElementById('savedSongs').classList.remove('hidden');
            document.getElementById('queue').classList.remove('hidden');
            document.getElementById('menu').classList.remove('hidden');
            document.getElementById('searchbar').classList.remove('hidden');
            document.getElementById('now-playing').classList.remove('hidden');
            document.getElementById('volume-container').classList.remove('hidden');

            document.getElementById('title').textContent = 'Spotify Controls';
            document.getElementById('title').style.fontSize = '45px';

            document.getElementById('song-title').classList.remove('hidden');
    
            document.getElementById('switchApi').classList.add('hidden');
            document.getElementById('back').classList.add('hidden');
            document.getElementById('songlist-container').classList.add('hidden');
            document.getElementById('savedSongs-container').classList.add('hidden');

        });

        document.getElementById('menu').addEventListener('click', () => {
            document.getElementById('title').style.fontSize = '52px';
        });

        document.getElementById('queue').addEventListener('click', () => {
            document.getElementById('imagebox').classList.add('hidden');
            document.getElementById('progress-container').classList.add('hidden');
            document.getElementById('savedSongs').classList.add('hidden');
            document.getElementById('queue').classList.add('hidden');
            document.getElementById('menu').classList.add('hidden');
            document.getElementById('searchbar').classList.add('hidden');
            document.getElementById('now-playing').classList.add('hidden');
            document.getElementById('volume-container').classList.add('hidden');

            document.getElementById('title').textContent = 'Queue';
            document.getElementById('back').classList.remove('hidden');
            document.getElementById('songlist-container').classList.remove('hidden');
    
            updateSpotifyQueue();
    
        });

        
        document.getElementById('volume-up').addEventListener('click', () => {
            updateSpotifyVolume(10);
        });
        
        document.getElementById('volume-down').addEventListener('click', () => {
            updateSpotifyVolume(-10);
        });
        
    } 
    else {
        console.log('Setting up YouTube control buttons');
        document.getElementById('pause-button').addEventListener('click', togglePlayPause);
        document.getElementById('next-button').addEventListener('click', playNextSong);
        document.getElementById('prev-button').addEventListener('click', playPreviousSong);

        document.getElementById('back').addEventListener('click', () => {
            document.getElementById('imagebox').classList.remove('hidden');
            document.getElementById('progress-container').classList.remove('hidden');
            document.getElementById('savedSongs').classList.remove('hidden');
            document.getElementById('queue').classList.remove('hidden');
            document.getElementById('menu').classList.remove('hidden');
            document.getElementById('searchbar').classList.remove('hidden');
            document.getElementById('now-playing').classList.remove('hidden');
            document.getElementById('volume-container').classList.remove('hidden');
    
    
            document.getElementById('title').textContent = 'Twilight';
            document.getElementById('switchApi').classList.add('hidden');
            document.getElementById('back').classList.add('hidden');
            document.getElementById('songlist-container').classList.add('hidden');
            document.getElementById('savedSongs-container').classList.add('hidden');
            
        });

        document.getElementById('queue').addEventListener('click', () => {
            document.getElementById('imagebox').classList.add('hidden');
            document.getElementById('progress-container').classList.add('hidden');
            document.getElementById('savedSongs').classList.add('hidden');
            document.getElementById('queue').classList.add('hidden');
            document.getElementById('menu').classList.add('hidden');
            document.getElementById('searchbar').classList.add('hidden');
            document.getElementById('now-playing').classList.add('hidden');
            document.getElementById('volume-container').classList.add('hidden');
            
    
            document.getElementById('title').textContent = 'Queue';
            document.getElementById('back').classList.remove('hidden');
            document.getElementById('songlist-container').classList.remove('hidden');
    
            updateQueue();
    
        });

        document.getElementById('savedSongs').addEventListener('click', () => {
            document.getElementById('imagebox').classList.add('hidden');
            document.getElementById('progress-container').classList.add('hidden');
            document.getElementById('savedSongs').classList.add('hidden');
            document.getElementById('queue').classList.add('hidden');
            document.getElementById('menu').classList.add('hidden');
            document.getElementById('now-playing').classList.add('hidden');
            document.getElementById('searchbar').classList.add('hidden');
            document.getElementById('volume-container').classList.add('hidden');
    
            document.getElementById('title').textContent = 'Saved Songs';
            document.getElementById('back').classList.remove('hidden');
        });

        document.getElementById('volume-up').addEventListener('click', () => {
            updateVolume(10);
        });
        
        document.getElementById('volume-down').addEventListener('click', () => {
            updateVolume(-10);
        });
        
    }
    
    if (window.appState.currentApiMode === 'spotify') {
        updateSpotifyPlayPauseButton();
    }
    
    console.log('Control button listeners updated successfully');
}


function updateSearchBarBehavior() {
    const searchBar = document.getElementById('searchbar');
    
    searchBar.replaceWith(searchBar.cloneNode(true));
    
    const newSearchBar = document.getElementById('searchbar');
    
    newSearchBar.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = newSearchBar.value.trim();
            if (query) {
                if (window.appState.currentApiMode === 'spotify') {
                    searchSpotifySongs(query);
                }
                else {
                    searchSongs(query);
                }
            }
        }
    });

    // newSearchBar.addEventListener('paste', (e) => {
    //     setTimeout(() => {
    //         const query = newSearchBar.value.trim();
    //         if (query && (query.includes('open.spotify.com/'))) {
    //                 if (window.appState.currentApiMode === 'spotify') {
    //                     searchSpotifySongs(query);
    //                 }
    //                 else {
    //                     searchSongs(query);
    //                 }
    //         }
    //     }, 100);
    // });

}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Setting up Spotify button listeners');

    updateControlButtonListeners();
    
    setupSpotifyProgressBarInteraction();
    
    const pauseButton = document.getElementById('pause-button');
    if (pauseButton) {
        console.log('Pause button found and initialized');
    } 
    else {
        console.error('Pause button not found in DOM');
    }

});

window.spotifyFunctions = {
    searchSpotifySongs: searchSpotifySongs,
    switchAPI: switchAPI,
    currentApiMode: function() {
        return window.appState.currentApiMode;
    }
};