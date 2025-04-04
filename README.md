# Twilight
This is an electron-based application that implements both Youtube API and Spotify API, but mainly focuses on the Youtube API. The app allows the user to be able to search up a song and play it with ease. There is also a playlist funtionality, where the user can create "playlists" and save video ID's, so that they would not have to keep saerching up the same song over and over again; it would be all in one place.

# How It Was Made
HTML, JavaScript, CSS

The main files are named main.js, youtube.js, spotify.js, and saved_songs.js. The main.js file is responsible for creation of the main window, and the ipcMain.handle aspects of the application, while youtube.js, spotify.js, and saved_songs.js are Renderer files. the youtube.j and spotify.js files are in charge of their own API's, while the saved_songs.js file uses the Youtube API as well.
You will need to fill in your own youtube and spotify API keys, as the app will not work without it.

The application is electron-based, so the user will need to install the npm packages.

npm init -y

npm install --save-dev electron

npm start

Will also need to create a .env file containing:

YOUTUBE_API_KEY=

SPOTIFY_CLIENT_ID=

SPOTIFY_CLIENT_SECRET=

SPOTIFY_REDIRECT_URI=


Youtube.js:

The Youtube file utilizes the onYouTubeIframeAPIReady function, meaning that it allows Youtube videos to be played without the need to be seen in the app; the video is played in the background, so it acts like an audio player. 

# Still In Development
This app is no where near finished due to only being worked on for a short period of time; for example, the shuffle function for the playlists is not implemented yet, but will be in the future.

# Takeaways

