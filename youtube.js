const { ipcRenderer } = require('electron');

let player;
let searchResults = [];
let history = [];
let MAX_HISTORY_LENGTH = 10;        // Use if you need to limit queue list
let currentVideoId = '';
let isPlaying = false;
let currentIndex = -1;
let progressInterval;

let errorTimeout;

// volume level
let volume = 50;

// Global app state
window.appState = window.appState || {};
window.appState.currentApiMode = 'youtube';

// Initialize YouTube IFrame API
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '0',
        width: '0',
        videoId: '',
        playerVars: {
            'playsinline': 1,
            'controls': 0,
            'disablekb': 1,
            'enablejsapi': 1,
            'origin': 'file://',
            'widget_referrer': 'YOUR_APP_NAME',
            'fs': 0
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady(event) {
    console.log('YouTube player is ready');
    document.getElementById('pause-button').disabled = false;

    if (player && player.setVolume) {
        player.setVolume(50);
    }
}

function onPlayerStateChange(event) {
    
    // play next song if 0
    if (event.data === 0) {
        // add to history
        if (currentVideoId && searchResults[currentIndex]) {
            addToHistory(searchResults[currentIndex]);
        }

        playNextSong();
        clearInterval(progressInterval);
    }

    // 1 is playing, 2 is paused
    isPlaying = event.data === 1;
    updatePlayPauseButton();
    
    // Start or stop progress tracking
    if (isPlaying) {
        startProgressTracking();
    } 
    else {
        clearInterval(progressInterval);
    }
}

function onPlayerError(event) {

    let errorMessage = 'Error playing song';
    let errorCode = event.data;

    console.error(`YouTube player error code: ${errorCode}`);
    
    // Log additional information about the video that failed
    console.error(`Failed video ID: ${currentVideoId}`);
    console.error(`Video title: ${searchResults[currentIndex]?.snippet?.title || 'Unknown'}`);


    // test cases for different fails
    switch (event.data) {
        case 2:
            errorMessage = 'Invalid video ID';
            break;
        case 5:
            errorMessage = 'HTML5 player error';
            break;
        case 100:
            errorMessage = 'Video not found';
            break;
        case 101:
        case 150:
            errorMessage = 'Embedding disabled for this video';
            break;
    }

    console.error('YouTube player error:', event.data);
    document.getElementById('song-title').textContent = errorMessage;


    if (searchResults.length > 1 && currentIndex < searchResults.length - 1) {
        // play next song after delay

        clearTimeout(errorTimeout);

        errorTimeout = setTimeout(() => {
            playNextSong();
        }, 2000);
    }

    clearInterval(progressInterval);
}

// Track progress of song
function startProgressTracking() {
    
    clearInterval(progressInterval);    // clear existing interval if any
    updateProgress();
    progressInterval = setInterval(updateProgress, 500); // update every 500ms
}

function updateProgress() {
    if (!player || !player.getCurrentTime) {
        return;
    }
    
    try {
        const currentTime = player.getCurrentTime() || 0;
        const duration = player.getDuration() || 0;
        const progressPercent = (currentTime / duration) * 100;
        
        // Update progress bar
        document.getElementById('progress-current').style.width = `${progressPercent}%`;
        
        // Update time display
        document.getElementById('current-time').textContent = formatTime(currentTime);
        document.getElementById('duration').textContent = formatTime(duration - currentTime);
    } 
    catch (error) {
        console.error('Error updating progress:', error);
    }
}

// time format for progress bar
function formatTime(timeInSeconds) {
    if (isNaN(timeInSeconds)) return '0:00';
    
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Allow seeking when clicking on progress bar
function setupProgressBarInteraction() {

    const progressBar = document.getElementById('progress-bar');
    
    progressBar.addEventListener('click', (e) => {
        if (!player || !player.getDuration) {
            return;
        }
        
        const rect = progressBar.getBoundingClientRect();
        const clickPosition = (e.clientX - rect.left) / rect.width;
        const seekToTime = player.getDuration() * clickPosition;
        
        // Seek to the clicked position
        player.seekTo(seekToTime, true);
        
        // Update progress bar
        document.getElementById('progress-current').style.width = `${clickPosition * 100}%`;
    });
}

// Search for songs using YouTube API
async function searchSongs(query) {

    if (!query) {
        return;
    }

    try {
        document.getElementById('song-title').textContent = 'Searching...';
        
        // Send request to main process to avoid CORS issues
        const data = await ipcRenderer.invoke('search-youtube', query);
        
        if (data.error) {
            console.error('Search error:', data.error);
            document.getElementById('song-title').textContent = 'Search error';
            return;
        }
        
        if (data.items && data.items.length > 0) {
            searchResults = data.items;
            displaySearchResults(searchResults);
            document.getElementById('song-title').textContent = 'Select a song';
        } 
        else {
            document.getElementById('song-title').textContent = 'No results found';
            searchResults = [];
            document.getElementById('search-results').innerHTML = '';
            document.getElementById('search-results').classList.add('hidden');
        }
    } 
    catch (error) {
        console.error('Error searching songs:', error);
        document.getElementById('song-title').textContent = 'Search failed';
    }
}

function displaySearchResults(results) {
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '';
    
    if (results.length === 0) {
        resultsContainer.classList.add('hidden');
        return;
    }
    
    resultsContainer.classList.remove('hidden');
    
    
    results.forEach((result, index) => {
        // create html elements for results
        const resultItem = document.createElement('div');
        resultItem.className = 'search-result';
        resultItem.textContent = result.snippet.title;

        // play song when clicked
        resultItem.addEventListener('click', () => {
            playSong(index);
            resultsContainer.classList.add('hidden');
        });
        resultsContainer.appendChild(resultItem);
    });

}

function playSong(index) {

    const songTitle = document.getElementById("song-title");
    clearTimeout(errorTimeout);

    if (!searchResults[index]) {
        return;
    }
    
    const selectedVideo = searchResults[index];

    if (currentVideoId && currentIndex !== -1 && searchResults[currentIndex]) {
        addToHistory(searchResults[currentIndex]);
    }

    currentVideoId = selectedVideo.id.videoId;
    currentIndex = index;
    
    // Progress bar reset
    document.getElementById('progress-current').style.width = '0%';
    document.getElementById('current-time').textContent = '0:00';
    document.getElementById('duration').textContent = '0:00';
    
    // UI update
    songTitle.classList.remove('hidden');
    document.getElementById('song-title').textContent = selectedVideo.snippet.title;
    
    // Update image
    let imageUrl = selectedVideo.snippet.thumbnails.high ? selectedVideo.snippet.thumbnails.high.url : selectedVideo.snippet.thumbnails.default.url;
    
    document.getElementById('imagebox').style.backgroundImage = `url(${imageUrl})`;
    
    // Load and play the song
    if (player && player.loadVideoById) {
        player.loadVideoById(currentVideoId);
        
        isPlaying = true;
        updatePlayPauseButton();

    }
    else {
        console.error('YouTube player not initialized');
        document.getElementById('song-title').textContent = 'Player error';
    }

    updateQueue();
}

function playNextSong() {
    if (currentIndex < searchResults.length - 1) {
        playSong(currentIndex + 1);
    }
}


function playPreviousSong() {
    if (currentIndex > 0) {
        playSong(currentIndex - 1);
    }
}

function togglePlayPause() {
    if (!player || !currentVideoId) {
        return;
    }
    
    if (isPlaying) {
        player.pauseVideo();
    } else {
        player.playVideo();
    }
}

function updatePlayPauseButton() {
    const pauseButton = document.getElementById('pause-button');
    pauseButton.textContent = isPlaying ? '❚❚' : '▶';
}


//update volume
function updateVolume(amount) {
    volume = Math.max(0, Math.min(100, volume + amount));

    if (player && player.setVolume) {
        player.setVolume(volume);
        console.log(`Volume is at ${volume}`);
    }
}

//update overall volume when button is clicked on
document.getElementById('volume-up').addEventListener('click', () => {
    updateVolume(10);
});

document.getElementById('volume-down').addEventListener('click', () => {
    updateVolume(-10);
});



// add song to history
function addToHistory(song) {

    // check for duplicates
    if (history.length === 0 || history[0].id.videoId !== song.id.videoId) {
        history.unshift(song);
    }

    // remove last song added to fit length
    // if(history.length > MAX_HISTORY_LENGTH) {
    //     history.pop();
    // }

    updateQueue();

}


function updateQueue() {
    const nextSong = document.getElementById('play-next');
    const pastSongs = document.getElementById('past-songs');


    // upcoming song
    if (currentIndex < searchResults.length - 1) {
        const nextSongData = searchResults[currentIndex + 1];
        nextSong.textContent = nextSongData.snippet.title
    }
    else {
        nextSong.textContent = 'No song in queue';
    }

    // past songs
    if (history.length > 0) {
        pastSongs.innerHTML = '';
        history.forEach(song => {
            const historyItem = document.createElement('div');
            historyItem.textContent = song.snippet.title;
            historyItem.className = 'history-item';
            historyItem.addEventListener('click', () => {

                // look for index of song in searchResults
                const index = searchResults.findIndex(s => s.id.videoId === song.id.videoId);
                if (index !== -1) {
                    playSong(index);
                } 
                else {
                    // add song if not in searchResults
                    searchResults.push(song);
                    playSong(searchResults.length - 1);
                }
            });
            // add element to pastSongs div
            pastSongs.appendChild(historyItem);
        });
    }
    else {
        pastSongs.textContent = 'No Song history detected';
    }

}

// Set up event listeners
// Happens when document object model is loaded
document.addEventListener('DOMContentLoaded', () => {

    const searchBar = document.getElementById('searchbar');
    
    document.getElementById('pause-button').disabled = true;

    setupProgressBarInteraction();
    
    // Search when enter key is pressed
    searchBar.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = searchBar.value.trim();
            if (query) {
                searchSongs(query);
            }
        }
    });

    searchBar.addEventListener('paste', (e) => {
        // Short delay to allow paste to complete
        setTimeout(() => {
            const query = searchBar.value.trim();
            if (query && (query.includes('youtube.com/') || query.includes('youtu.be/'))) {
                // Auto-submit when a YouTube URL is pasted
                searchSongs(query);
            }
        }, 100);
    });



    // Control buttons
    document.getElementById('pause-button').addEventListener('click', togglePlayPause);
    document.getElementById('next-button').addEventListener('click', playNextSong);
    document.getElementById('prev-button').addEventListener('click', playPreviousSong);
    
    // Close search results when clicking off
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#search-results') && !e.target.closest('#searchbar')) {
            document.getElementById('search-results').classList.add('hidden');
        }
    });
    
    // Menu button
    document.getElementById('menu').addEventListener('click', () => {
        document.getElementById('imagebox').classList.add('hidden');
        document.getElementById('progress-container').classList.add('hidden');
        document.getElementById('savedSongs').classList.add('hidden');
        document.getElementById('queue').classList.add('hidden');
        document.getElementById('menu').classList.add('hidden');
        document.getElementById('searchbar').classList.add('hidden');
        document.getElementById('now-playing').classList.add('hidden');
        document.getElementById('volume-container').classList.add('hidden');



        document.getElementById('title').textContent = 'Menu';
        document.getElementById('back').classList.remove('hidden');
        document.getElementById('switchApi').classList.remove('hidden');
    });


    // queue button
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


    // playlist button
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
        document.getElementById('savedSongs-container').classList.remove('hidden');
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


        document.getElementById('title').textContent = 'Twilight';
        document.getElementById('switchApi').classList.add('hidden');
        document.getElementById('back').classList.add('hidden');
        document.getElementById('songlist-container').classList.add('hidden');
        document.getElementById('savedSongs-container').classList.add('hidden');
        
    });

    document.getElementById('switchApi').addEventListener('click', () => {
        console.log('Switch API clicked. Current mode:', window.appState.currentApiMode);

        const newMode = window.appState.currentApiMode === 'youtube' ? 'spotify' : 'youtube';
        console.log('Switching to mode:', newMode);
        // Call the switch function directly without accessing through window.spotifyFunctions
        if (typeof switchAPI === 'function') {
            switchAPI(newMode);
        } 
        else if (window.spotifyFunctions && typeof window.spotifyFunctions.switchAPI === 'function') {
            window.spotifyFunctions.switchAPI(newMode);
        } 
        else {
            console.error('switchAPI function not found!');
        }
    });
    
    // initialize w/ youtube api
    if (window.spotifyFunctions && window.spotifyFunctions.switchAPI) {
        window.spotifyFunctions.switchAPI('youtube');
    } 
    else {
        console.error("Spotify functions not available - ensure spotify.js loads before youtube.js");
        window.appState.currentApiMode = 'youtube';     // default
    }

});

// tabs on top
document.getElementById('exit-button').addEventListener('click', () => {
    const { ipcRenderer } = require('electron');
    vanishAudio();
    ipcRenderer.send('quit-app');
  });

document.getElementById('reset-button').addEventListener('click', () => {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('reload-app');
  });


// Make sure youtube API is working
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;