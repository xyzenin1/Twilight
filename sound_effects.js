document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded, playing intro audio');
    
    const midnaAudio = document.getElementById('midnaAppears');
    if (midnaAudio) {
        midnaAudio.volume = 0.5;

        midnaAudio.play();
    }
});

function playTransformSound() {
    const wolfAudio = document.getElementById('wolfTransform');
    const humanAudio = document.getElementById('humanTransform');
    
    if (wolfAudio && window.appState.currentApiMode === 'youtube') {
        wolfAudio.currentTime = 0;
        wolfAudio.volume = 0.5;
        wolfAudio.play();
    }
    if (humanAudio && window.appState.currentApiMode === 'spotify') {
        humanAudio.currentTime = 0;
        humanAudio.volume = 0.5;
        humanAudio.play();
    }
}

function vanishAudio() {
    const vanishAudio = document.getElementById('midnaVanish');
    vanishAudio.currentTime = 0;
    vanishAudio.volume = 0.5;
    vanishAudio.play();
}
