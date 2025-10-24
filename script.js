// WebRTC Configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Application State
let localStream = null;
let localAudioStream = null;
let remoteStream = null;
let peerConnection = null;
let isAudioMuted = false;
let isSharingScreen = false;

// Signaling Channel (Mock - Replace with real WebSocket/Socket.io in production)
class SignalingChannel {
    constructor() {
        this.handlers = {};
        // In production, replace this with actual WebSocket connection
        this.mockPeerId = Math.random().toString(36).substr(2, 9);
    }

    on(event, handler) {
        this.handlers[event] = handler;
    }

    send(type, data) {
        console.log('Sending:', type, data);
        // Mock implementation - in production, send via WebSocket
        // For demo purposes, simulate peer responses
        setTimeout(() => {
            if (type === 'offer' && this.handlers['answer']) {
                // Simulate receiving an answer
                this.simulateAnswer(data);
            }
        }, 1000);
    }

    simulateAnswer(offer) {
        // This is a mock - in production, the remote peer would send this
        console.log('Mock: Simulating peer answer');
    }

    connect(roomId) {
        console.log('Connecting to room:', roomId);
        // In production: ws://your-server.com/room/${roomId}
        return Promise.resolve();
    }

    disconnect() {
        console.log('Disconnecting from signaling server');
    }
}

const signaling = new SignalingChannel();

// DOM Elements
const connectionPanel = document.getElementById('connectionPanel');
const chatInterface = document.getElementById('chatInterface');
const roomIdInput = document.getElementById('roomId');
const connectBtn = document.getElementById('connectBtn');
const statusDiv = document.getElementById('status');
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

    // Set up signaling handlers
    signaling.on('offer', handleOffer);
    signaling.on('answer', handleAnswer);
    signaling.on('ice-candidate', handleIceCandidate);
}

// Connect to room
async function connect() {
    const roomId = roomIdInput.value.trim();
    if (!roomId) {
        alert('Please enter a room ID');
        return;
    }

    try {
        updateStatus('Connecting...');
        
        // Connect to signaling server
        await signaling.connect(roomId);
        
        // Start audio stream
        await startAudioStream();
        
        // Start screen sharing
        await startScreenShare();
        
        // Create peer connection
        createPeerConnection();
        
        // Switch to chat interface
        connectionPanel.classList.add('hidden');
        chatInterface.classList.remove('hidden');
        
        updateStatus('Connected - Sharing screen');
        isSharingScreen = true;
        
    } catch (error) {
        console.error('Connection error:', error);
        alert('Failed to connect: ' + error.message);
        updateStatus('Connection failed');
    }
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

// Create peer connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);
    
    // Add local audio tracks
    if (localAudioStream) {
        localAudioStream.getAudioTracks().forEach(track => {
            peerConnection.addTrack(track, localAudioStream);
        });
    }
    
    // Add local video (screen) tracks
    if (localStream) {
        localStream.getVideoTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
    
    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        
        if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteVideo.srcObject = remoteStream;
        }
        
        remoteStream.addTrack(event.track);
    };
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            signaling.send('ice-candidate', event.candidate);
        }
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        updateStatus('Connected - ' + peerConnection.connectionState);
    };
    
    // Create and send offer
    createOffer();
}

// Create offer
async function createOffer() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        signaling.send('offer', offer);
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

// Handle incoming offer
async function handleOffer(offer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        signaling.send('answer', answer);
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

// Handle incoming answer
async function handleAnswer(answer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Error handling answer:', error);
    }
}

// Handle ICE candidate
async function handleIceCandidate(candidate) {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
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
    } else {
        // Start screen sharing
        try {
            await startScreenShare();
            
            // Replace video track in peer connection
            if (peerConnection) {
                const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
                if (sender && localStream) {
                    await sender.replaceTrack(localStream.getVideoTracks()[0]);
                }
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
    // Stop all tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (localAudioStream) {
        localAudioStream.getTracks().forEach(track => track.stop());
    }
    
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Disconnect signaling
    signaling.disconnect();
    
    // Reset UI
    chatInterface.classList.add('hidden');
    connectionPanel.classList.remove('hidden');
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    localPreview.classList.remove('hidden-video');
    
    // Reset state
    localStream = null;
    localAudioStream = null;
    remoteStream = null;
    isAudioMuted = false;
    isSharingScreen = false;
    
    updateStatus('Disconnected');
}

// Update status
function updateStatus(message) {
    statusDiv.textContent = message;
}

// Initialize on load
init();

console.log('Screen Share Audio Chat initialized');
console.log('Note: This demo uses a mock signaling server.');
console.log('For production, implement a real WebSocket signaling server.');
