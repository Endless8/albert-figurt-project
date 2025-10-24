// Application State
let peer = null;
let currentCall = null;
let localStream = null;
let localAudioStream = null;
let remoteStream = null;
let isAudioMuted = false;
let isSharingScreen = false;
let myPeerId = null;

// DOM Elements
const connectionPanel = document.getElementById('connectionPanel');
const chatInterface = document.getElementById('chatInterface');
const roomIdInput = document.getElementById('roomId');
const connectBtn = document.getElementById('connectBtn');
const statusDiv = document.getElementById('status');
const peerIdDiv = document.getElementById('peerId');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localPreview = document.getElementById('localPreview');
const remotePreview = document.getElementById('remotePreview');
const localTooltip = document.getElementById('localTooltip');
const fullscreenOverlay = document.getElementById('fullscreenOverlay');
const fullscreenVideo = document.getElementById('fullscreenVideo');
const exitFullscreenBtn = document.getElementById('exitFullscreen');
const toggleAudioBtn = document.getElementById('toggleAudio');
const toggleScreenBtn = document.getElementById('toggleScreen');
const disconnectBtn = document.getElementById('disconnectBtn');

// Initialize
function init() {
    // Set up event listeners
    connectBtn.addEventListener('click', connect);
    disconnectBtn.addEventListener('click', disconnect);
    toggleAudioBtn.addEventListener('click', toggleAudio);
    toggleScreenBtn.addEventListener('click', toggleScreenShare);
    exitFullscreenBtn.addEventListener('click', exitFullscreen);
    
    // Preview click handlers
    localPreview.addEventListener('click', () => {
        // Show tooltip with instruction to minimize browser
        localTooltip.classList.remove('hidden');
        
        // Hide tooltip after 3 seconds
        setTimeout(() => {
            localTooltip.classList.add('hidden');
        }, 3000);
    });
    
    remotePreview.addEventListener('click', () => {
        showFullscreen(remoteVideo);
    });
}

// Connect to room
async function connect() {
    const remotePeerId = roomIdInput.value.trim();

    try {
        updateStatus('Initializing...');
        
        // Initialize PeerJS
        peer = new Peer({
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });

        // Wait for peer to open
        await new Promise((resolve, reject) => {
            peer.on('open', (id) => {
                myPeerId = id;
                console.log('My peer ID:', id);
                resolve();
            });
            
            peer.on('error', (err) => {
                console.error('Peer error:', err);
                reject(err);
            });
        });

        // Start audio stream
        await startAudioStream();
        
        // Start screen sharing
        await startScreenShare();
        
        // Combine audio and video streams
        const combinedStream = new MediaStream([
            ...localAudioStream.getAudioTracks(),
            ...localStream.getVideoTracks()
        ]);

        // If room ID provided, call that peer
        if (remotePeerId) {
            updateStatus('Calling peer...');
            currentCall = peer.call(remotePeerId, combinedStream);
            setupCallHandlers(currentCall);
        } else {
            // Show my peer ID for others to connect
            peerIdDiv.innerHTML = `<strong>Your Peer ID:</strong> ${myPeerId}<br><small>Share this ID with others to connect</small>`;
            peerIdDiv.classList.remove('hidden');
            updateStatus('Waiting for connection...');
        }

        // Handle incoming calls
        peer.on('call', (call) => {
            console.log('Receiving call from:', call.peer);
            updateStatus('Incoming call...');
            
            // Answer with our combined stream
            call.answer(combinedStream);
            currentCall = call;
            setupCallHandlers(call);
        });
        
        // Switch to chat interface
        connectionPanel.classList.add('hidden');
        chatInterface.classList.remove('hidden');
        
        isSharingScreen = true;
        
    } catch (error) {
        console.error('Connection error:', error);
        alert('Failed to connect: ' + error.message);
        updateStatus('Connection failed');
        cleanup();
    }
}

// Setup call event handlers
function setupCallHandlers(call) {
    call.on('stream', (stream) => {
        console.log('Received remote stream');
        remoteStream = stream;
        remoteVideo.srcObject = stream;
        updateStatus('Connected');
    });

    call.on('close', () => {
        console.log('Call closed');
        updateStatus('Call ended');
        if (remoteStream) {
            remoteStream.getTracks().forEach(track => track.stop());
            remoteStream = null;
            remoteVideo.srcObject = null;
        }
    });

    call.on('error', (err) => {
        console.error('Call error:', err);
        updateStatus('Call error: ' + err.type);
    });
}

// Start audio stream
async function startAudioStream() {
    try {
        localAudioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: false 
        });
        console.log('Audio stream started');
    } catch (error) {
        console.error('Error accessing microphone:', error);
        throw new Error('Could not access microphone. Please grant permission.');
    }
}

// Start screen sharing
async function startScreenShare() {
    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always',
                displaySurface: 'monitor'
            },
            audio: false
        });
        
        localVideo.srcObject = localStream;
        
        // Hide local video to prevent mirror chain
        localPreview.classList.add('hidden-video');
        
        // Handle screen share stop
        localStream.getVideoTracks()[0].addEventListener('ended', () => {
            console.log('Screen sharing stopped by user');
            isSharingScreen = false;
            localPreview.classList.remove('hidden-video');
            updateToggleScreenButton();
        });
        
        console.log('Screen sharing started');
    } catch (error) {
        console.error('Error starting screen share:', error);
        throw new Error('Could not start screen sharing. Please grant permission and select your screen.');
    }
}

// Toggle audio
function toggleAudio() {
    if (localAudioStream) {
        const audioTrack = localAudioStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        isAudioMuted = !audioTrack.enabled;
        
        updateToggleAudioButton();
    }
}

// Update toggle audio button
function updateToggleAudioButton() {
    const span = toggleAudioBtn.querySelector('span:last-child');
    span.textContent = isAudioMuted ? 'Unmute' : 'Mute';
    toggleAudioBtn.style.background = isAudioMuted ? '#e74c3c' : '#667eea';
}

// Toggle screen share
async function toggleScreenShare() {
    if (isSharingScreen) {
        // Stop screen sharing
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
            localVideo.srcObject = null;
            localPreview.classList.remove('hidden-video');
        }
        isSharingScreen = false;
        
        // Update call with audio only
        if (currentCall && localAudioStream) {
            const sender = currentCall.peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                currentCall.peerConnection.removeTrack(sender);
            }
        }
    } else {
        // Start screen sharing
        try {
            await startScreenShare();
            
            // Update call with new video track
            if (currentCall && localStream) {
                const videoTrack = localStream.getVideoTracks()[0];
                currentCall.peerConnection.addTrack(videoTrack, localStream);
            }
            
            isSharingScreen = true;
        } catch (error) {
            console.error('Error toggling screen share:', error);
            alert('Failed to start screen sharing: ' + error.message);
        }
    }
    
    updateToggleScreenButton();
}

// Update toggle screen button
function updateToggleScreenButton() {
    const span = toggleScreenBtn.querySelector('span:last-child');
    span.textContent = isSharingScreen ? 'Stop Sharing' : 'Start Sharing';
    toggleScreenBtn.style.background = isSharingScreen ? '#e74c3c' : '#667eea';
}

// Show fullscreen
function showFullscreen(videoElement) {
    fullscreenVideo.srcObject = videoElement.srcObject;
    fullscreenOverlay.classList.remove('hidden');
}

// Exit fullscreen
function exitFullscreen() {
    fullscreenOverlay.classList.add('hidden');
    fullscreenVideo.srcObject = null;
}

// Disconnect
function disconnect() {
    cleanup();
    
    // Reset UI
    chatInterface.classList.add('hidden');
    connectionPanel.classList.remove('hidden');
    peerIdDiv.classList.add('hidden');
    roomIdInput.value = '';
    
    updateStatus('Disconnected');
}

// Cleanup resources
function cleanup() {
    // Stop all tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (localAudioStream) {
        localAudioStream.getTracks().forEach(track => track.stop());
        localAudioStream = null;
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }
    
    // Close call
    if (currentCall) {
        currentCall.close();
        currentCall = null;
    }
    
    // Destroy peer
    if (peer) {
        peer.destroy();
        peer = null;
    }
    
    // Reset videos
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    localPreview.classList.remove('hidden-video');
    
    // Reset state
    isAudioMuted = false;
    isSharingScreen = false;
    myPeerId = null;
}

// Update status
function updateStatus(message) {
    statusDiv.textContent = message;
}

// Initialize on load
init();

console.log('Screen Share Audio Chat initialized with PeerJS');
console.log('Instructions:');
console.log('1. First user: Click Connect without entering a Room ID');
console.log('2. Copy the generated Peer ID');
console.log('3. Second user: Paste the Peer ID and click Connect');
