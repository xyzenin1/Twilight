let searchResultsForList = [];
let VideoId = '';

let savedPlaylists = [];
let selectedPlaylist = null;

window.appState = window.appState || {};
window.appState.currentApiMode = 'youtube';

async function searchSongsForList(query) {

    if (!query) {
        return;
    }

    try {
        const data = await ipcRenderer.invoke('search-youtube', query);
        
        if (data.error) {
            console.error('Search error:', data.error);
            return;
        }
        
        if (data.items && data.items.length > 0) {
            searchResultsForList = data.items;
            displaySearchResultsForList(searchResultsForList);
        } 
        else {
            searchResultsForList = [];
            document.getElementById('addSongSearch-results').innerHTML = '';
            document.getElementById('addSongSearch-results').classList.add('hidden');
        }
    } 
    catch (error) {
        console.error('Error searching songs:', error);
    }
}

function displaySearchResultsForList(results) {
    const resultsContainer = document.getElementById('addSongSearch-results');
    resultsContainer.innerHTML = '';
    
    if (results.length === 0) {
        resultsContainer.classList.add('hidden');
        return;
    }
    
    resultsContainer.classList.remove('hidden');
    
    
    results.forEach((result, index) => {
        // create html elements for results
        const resultItem = document.createElement('div');
        resultItem.className = 'addSongSearch-result';
        resultItem.textContent = result.snippet.title;

        resultItem.addEventListener('click', () => {
            // save video id
            const videoId = result.id.videoId;
            saveVideoId(videoId, result.snippet.title);
        });

        resultsContainer.appendChild(resultItem);
    });

}

async function saveVideoId(videoId, videoTitle) {
    if (!selectedPlaylist) {
        alert("please select a playlist to add to first!");
        document.getElementById('addSongSearch-results').classList.remove('hidden');
        return;
    }

    // console.log("Checking if video can be embedded...");
    // const isEmbeddable = await checkYoutubeEmbed(videoId);

    // if (!isEmbeddable) {
    //     alert("This YouTube video cannot be embedded for some unknown reason.");
    //     return;
    // }

    const songData = `${videoId}|${videoTitle}\n`;

    try {
        const result = await ipcRenderer.invoke('save-song-to-playlist', {
            playlistPath: selectedPlaylist,
            songData: songData
        });
        
        if (result.success) {
            console.log("New song added to playlist!");
            document.getElementById('addSongBar').value = '';
            document.getElementById('addSongSearch-results').classList.add('hidden');
        }
        else {
            console.error("An error has occurred when saving song:", result.error);
            alert("Could not save song! " + result.error);
            document.getElementById('addSongSearch-results').classList.remove('hidden');
        }
    } 
    catch (error) {
        console.error('Error in using save-song:', error);
        alert("Failed to save song to playlist.");
        document.getElementById('addSongSearch-results').classList.remove('hidden');
    }

}




// // test youtube embedding in hidden iframe
// async function checkYoutubeEmbed(videoId) {
//     return new Promise((resolve) => {
//         // check if video exists
//         fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
//             .then(response => {
//                 if (response.ok) {
//                     // check if embed works
//                     const testIframe = document.createElement('iframe');
//                     let timeoutId = null;

//                     const cleanupAndResolve = (result) => {
//                         if (timeoutId) clearTimeout(timeoutId);
//                         testIframe.remove();
//                         resolve(result);
//                     };

//                     testIframe.addEventListener('load', () => {
//                         // small delay to initialize youtube
//                         setTimeout(() => {
//                             try {
                        
//                                 if (testIframe.contentWindow && !testIframe.contentWindow.document.body.innerText.includes("Video unavailable")) {
//                                     cleanupAndResolve(true);
//                                 } 
//                                 else {
//                                     cleanupAndResolve(false);
//                                 }
//                             } 
//                             catch (e) {
//                                 // if iframe does not work, assume embed works
//                                 cleanupAndResolve(true);
//                             }
//                         }, 1000);
//                     });

//                     testIframe.addEventListener('error', () => {
//                         cleanupAndResolve(false);
//                     });

//                     timeoutId = setTimeout(() => {
//                         cleanupAndResolve(false);
//                     }, 5000);

//                     testIframe.style.display = 'none';
//                     testIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=0`;
//                     document.body.appendChild(testIframe);
//                 } 
//                 else {
//                     // If all else fails, embed does not work
//                     resolve(false);
//                 }
//             })
//             .catch(() => {
//                 resolve(false);
//             });
//     });
// }





function displaySavedPlaylists(playlists) {
    const savedSongsList = document.getElementById('savedSongsList');
    savedSongsList.innerHTML = '';
    

    // if no playlists are found
    if (!playlists || playlists.length === 0) {
        const noPlaylistsMsg = document.createElement('div');
        noPlaylistsMsg.className = 'no-playlists-message';
        noPlaylistsMsg.textContent = 'No playlists saved yet.';
        savedSongsList.appendChild(noPlaylistsMsg);
        return;
    }
    
    // Create a list of saved playlists
    playlists.forEach((playlistPath) => {
        const playlistName = playlistPath.split('\\').pop().split('/').pop(); // Extract filename from path
        
        const playlistItem = document.createElement('div');
        playlistItem.className = 'saved-playlist-item';
        playlistItem.dataset.path = playlistPath;
        playlistItem.textContent = playlistName;
        
        playlistItem.addEventListener('click', () => {
            // Highlight the selected playlist
            document.querySelectorAll('.saved-playlist-item').forEach(item => {
                item.classList.remove('selected');
            });
            playlistItem.classList.add('selected');
            
            selectedPlaylist = playlistPath;
            console.log('Selected playlist:', playlistPath);
        });

        playlistItem.addEventListener('dblclick', () => {
            document.querySelectorAll('.saved-playlist-item').forEach(item => {
                item.classList.remove('selected');
            });
            playlistItem.classList.add('selected');
            
            selectedPlaylist = playlistPath;
            console.log('Opening playlist file:', playlistPath);
            
            ipcRenderer.send('open-file', playlistPath);
        });
        
        savedSongsList.appendChild(playlistItem);
    });
    
}

async function loadSavedPlaylists() {
    try {
        savedPlaylists = await ipcRenderer.invoke('get-saved-playlists');
        displaySavedPlaylists(savedPlaylists);
    } 
    catch (error) {
        console.error('Error loading saved playlists:', error);
    }
}

async function playSongFromPlaylist() {
    if (!selectedPlaylist) {
        alert("No playlist selected!");
    }

    try {
        const playlistContent = await ipcRenderer.invoke('read-playlist', selectedPlaylist);
        
        if (!playlistContent || playlistContent.trim() === '') {
            alert("The selected playlist is empty!");
            return;
        }
        
        const songs = playlistContent.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => {
                const [videoId, title] = line.split('|');
                return {
                    id: { videoId },
                    snippet: { 
                        title,
                        thumbnails: {
                            default: { url: `https://i.ytimg.com/vi/${videoId}/default.jpg` },
                            high: { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }
                        }
                    }
                };
            });
        
        if (songs.length === 0) {
            alert("No valid songs found in the playlist!");
            return;
        }
        
        // Set these songs as the current search results
        searchResults = songs;
        currentIndex = -1;
        
        // play first song
        if (window.appState.currentApiMode === 'youtube' && player) {
            playSong(0);
        } 
        else {
            alert("Player not ready yet.");
        }
    } 
    catch (error) {
        console.error('Error playing songs from playlist:', error);
        alert("Failed to play songs from playlist: " + error.message);
    }
}


playButton.addEventListener('click', () => {
    playSongFromPlaylist();
});



document.addEventListener('DOMContentLoaded', () => {
    const addSongSearchBar = document.getElementById('addSongBar');
    const playlistButton = document.getElementById('createPlaylistButton');
    
    // Load saved playlists when the app starts
    loadSavedPlaylists();
    
    // Search when enter key is pressed
    addSongSearchBar.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = addSongSearchBar.value.trim();
            if (query) {
                searchSongsForList(query);
            }
        }
    });


    addSongSearchBar.addEventListener('paste', (e) => {
        setTimeout(() => {
            const query = addSongSearchBar.value.trim();
            if (query && (query.includes('youtube.com/') || query.includes('youtu.be/'))) {
                searchSongsForList(query);
            }
        }, 100);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#addSongSearch-results') && !e.target.closest('#addSongBar')) {
            document.getElementById('addSongSearch-results').classList.add('hidden');
        }
    });


    playlistButton.addEventListener('click', () => {
        ipcRenderer.send('create-document-triggered');
    });

    ipcRenderer.on('document-created', (_, data) => {
        // Update the saved playlists
        savedPlaylists = data.allPlaylists;
        // Display the updated list
        displaySavedPlaylists(savedPlaylists);

        selectedPlaylist = data.path;
        
        // UI update
        setTimeout(() => {
            const playlistItems = document.querySelectorAll('.saved-playlist-item');
            playlistItems.forEach(item => {
                if (item.dataset.path === data.path) {
                    item.classList.add('selected');
                }
            });
        }, 100);

    });
});