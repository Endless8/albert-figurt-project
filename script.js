// WebRTC Configuration
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// State management
let localStream = null;
let screenStream = null;
let peerConnection = null;
let isAudioEnabled = true;
let isVideoEnabled = false;
let isScreenSharing = false;
let pendingIceCandidates = [];

// DOM elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localVideoWrapper = document.getElementById('localVideoWrapper');
const toggleAudioBtn = document.getElementById('toggleAudio');
const toggleVideoBtn = document.getElementById('toggleVideo');
const shareScreenBtn = document.getElementById('shareScreen');
const endCallBtn = document.getElementById('endCall');
const createOfferBtn = document.getElementById('createOffer');
const createAnswerBtn = document.getElementById('createAnswer');
const connectPeerBtn = document.getElementById('connectPeer');
const copySignalBtn = document.getElementById('copySignal');
const generateRoomBtn = document.getElementById('generateRoom');
const localSignalArea = document.getElementById('localSignal');
const remoteSignalArea = document.getElementById('remoteSignal');
const roomIdInput = document.getElementById('roomId');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');

// Initialize media stream
async function initializeMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false // Start with video disabled
        });
        
        localVideo.srcObject = localStream;
        
        // Set initial audio state
        localStream.getAudioTracks()[0].enabled = isAudioEnabled;
        
        updateStatus('connecting', 'Ready to connect');
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Could not access microphone. Please check permissions.');
    }
}

// Update connection status
function updateStatus(status, text) {
    statusIndicator.className = `status-indicator ${status}`;
    statusText.textContent = text;
}

// Create peer connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);
    
    // Add local stream tracks
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
    
    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            updateStatus('connected', 'Connected');
        }
    };
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        // Update signal with each candidate or when gathering is complete
        if (peerConnection.localDescription) {
            const signal = JSON.stringify(peerConnection.localDescription);
            localSignalArea.value = signal;
        }
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log('Connection state:', state);
        
        if (state === 'connected') {
            updateStatus('connected', 'Connected');
        } else if (state === 'disconnected' || state === 'failed') {
            updateStatus('disconnected', 'Disconnected');
        }
    };
    
    return peerConnection;
}

// Create offer
async function createOffer() {
    try {
        if (!localStream) {
            await initializeMedia();
        }
        
        createPeerConnection();
        updateStatus('connecting', 'Creating offer...');
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Show signal immediately
        localSignalArea.value = JSON.stringify(peerConnection.localDescription);
        
        // Also set a timeout fallback
        setTimeout(() => {
            if (peerConnection && peerConnection.localDescription) {
                localSignalArea.value = JSON.stringify(peerConnection.localDescription);
            }
        }, 1000);
    } catch (error) {
        console.error('Error creating offer:', error);
        alert('Error creating offer: ' + error.message);
    }
}

// Create answer
async function createAnswer() {
    try {
        const signal = remoteSignalArea.value.trim();
        if (!signal) {
            alert('Please paste the peer\'s offer signal first');
            return;
        }
        
        if (!localStream) {
            await initializeMedia();
        }
        
        createPeerConnection();
        updateStatus('connecting', 'Creating answer...');
        
        const offer = JSON.parse(signal);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        // Show signal immediately
        localSignalArea.value = JSON.stringify(peerConnection.localDescription);
        
        // Also set a timeout fallback
        setTimeout(() => {
            if (peerConnection && peerConnection.localDescription) {
                localSignalArea.value = JSON.stringify(peerConnection.localDescription);
            }
        }, 1000);
    } catch (error) {
        console.error('Error creating answer:', error);
        alert('Error creating answer: ' + error.message);
    }
}

// Connect to peer
async function connectToPeer() {
    try {
        const signal = remoteSignalArea.value.trim();
        if (!signal) {
            alert('Please paste the peer\'s signal');
            return;
        }
        
        if (!peerConnection) {
            alert('Please create an offer first');
            return;
        }
        
        updateStatus('connecting', 'Connecting...');
        
        const answer = JSON.parse(signal);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Error connecting to peer:', error);
        alert('Error connecting: ' + error.message);
    }
}

// Toggle audio
function toggleAudio() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            isAudioEnabled = !isAudioEnabled;
            audioTrack.enabled = isAudioEnabled;
            
            toggleAudioBtn.classList.toggle('active', isAudioEnabled);
            toggleAudioBtn.querySelector('.label').textContent = isAudioEnabled ? 'Mic On' : 'Mic Off';
            toggleAudioBtn.querySelector('.icon').textContent = isAudioEnabled ? '🎤' : '🔇';
        }
    }
}

// Toggle video
async function toggleVideo() {
    try {
        if (!isVideoEnabled) {
            // Enable video
            const videoStream = await navigator.mediaDevices.getUserMedia({ 
                video: true,
                audio: false 
            });
            const videoTrack = videoStream.getVideoTracks()[0];
            
            // Stop old video track if exists
            const oldVideoTrack = localStream.getVideoTracks()[0];
            if (oldVideoTrack) {
                oldVideoTrack.stop();
                localStream.removeTrack(oldVideoTrack);
            }
            
            // Add new video track to local stream
            localStream.addTrack(videoTrack);
            
            // Update local video display
            localVideo.srcObject = localStream;
            
            // Replace or add video track in peer connection
            if (peerConnection) {
                const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(videoTrack);
                } else {
                    peerConnection.addTrack(videoTrack, localStream);
                }
            }
            
            isVideoEnabled = true;
            toggleVideoBtn.classList.add('active');
            toggleVideoBtn.querySelector('.label').textContent = 'Cam On';
            toggleVideoBtn.querySelector('.icon').textContent = '📷';
        } else {
            // Disable video
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.stop();
                localStream.removeTrack(videoTrack);
                
                // Replace with null track in peer connection
                if (peerConnection) {
                    const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
                    if (sender) {
                        await sender.replaceTrack(null);
                    }
                }
                
                // Refresh local video display
                localVideo.srcObject = localStream;
            }
            
            isVideoEnabled = false;
            toggleVideoBtn.classList.remove('active');
            toggleVideoBtn.querySelector('.label').textContent = 'Cam Off';
            toggleVideoBtn.querySelector('.icon').textContent = '📷';
        }
    } catch (error) {
        console.error('Error toggling video:', error);
        alert('Error toggling video: ' + error.message);
    }
}

// Share screen
async function shareScreen() {
    try {
        if (!isScreenSharing) {
            // Start screen sharing
            screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: true,
                audio: false
            });
            
            const screenTrack = screenStream.getVideoTracks()[0];
            
            // Replace video track with screen track
            const sender = peerConnection?.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                await sender.replaceTrack(screenTrack);
            } else if (peerConnection) {
                peerConnection.addTrack(screenTrack, screenStream);
            }
            
            // Minimize local video to prevent mirror loop
            localVideoWrapper.classList.add('minimized');
            
            // Handle screen share stop
            screenTrack.onended = () => {
                stopScreenShare();
            };
            
            isScreenSharing = true;
            shareScreenBtn.classList.add('active');
            shareScreenBtn.querySelector('.label').textContent = 'Stop Share';
            shareScreenBtn.querySelector('.icon').textContent = '🛑';
        } else {
            stopScreenShare();
        }
    } catch (error) {
        console.error('Error sharing screen:', error);
        if (error.name !== 'NotAllowedError') {
            alert('Error sharing screen: ' + error.message);
        }
    }
}

// Stop screen sharing
async function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        
        // Restore local video to normal size
        localVideoWrapper.classList.remove('minimized');
        
        // Replace screen track with camera track or null
        const sender = peerConnection?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
            if (isVideoEnabled && localStream.getVideoTracks()[0]) {
                await sender.replaceTrack(localStream.getVideoTracks()[0]);
            } else {
                await sender.replaceTrack(null);
            }
        }
        
        screenStream = null;
        isScreenSharing = false;
        shareScreenBtn.classList.remove('active');
        shareScreenBtn.querySelector('.label').textContent = 'Share';
        shareScreenBtn.querySelector('.icon').textContent = '🖥️';
    }
}

// End call
function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    localSignalArea.value = '';
    remoteSignalArea.value = '';
    
    isAudioEnabled = true;
    isVideoEnabled = false;
    isScreenSharing = false;
    
    toggleAudioBtn.classList.add('active');
    toggleVideoBtn.classList.remove('active');
    shareScreenBtn.classList.remove('active');
    localVideoWrapper.classList.remove('minimized');
    
    updateStatus('disconnected', 'Call ended');
}

// Copy signal to clipboard
function copySignal() {
    localSignalArea.select();
    document.execCommand('copy');
    
    const originalText = copySignalBtn.textContent;
    copySignalBtn.textContent = 'Copied!';
    setTimeout(() => {
        copySignalBtn.textContent = originalText;
    }, 2000);
}

// Generate random room ID
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let roomId = '';
    for (let i = 0; i < 8; i++) {
        roomId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    roomIdInput.value = roomId;
}

// Event listeners
toggleAudioBtn.addEventListener('click', toggleAudio);
toggleVideoBtn.addEventListener('click', toggleVideo);
shareScreenBtn.addEventListener('click', shareScreen);
endCallBtn.addEventListener('click', endCall);
createOfferBtn.addEventListener('click', createOffer);
createAnswerBtn.addEventListener('click', createAnswer);
connectPeerBtn.addEventListener('click', connectToPeer);
copySignalBtn.addEventListener('click', copySignal);
generateRoomBtn.addEventListener('click', generateRoomId);

// Initialize on page load
updateStatus('disconnected', 'Disconnected');
