let localStream;
let peerConnection;
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let localVideo, remoteVideo, statusDiv;

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    localVideo = document.getElementById('localVideo');
    remoteVideo = document.getElementById('remoteVideo');
    statusDiv = document.getElementById('status');
});

function updateStatus(message, type) {
    statusDiv.textContent = `Status: ${message}`;
    statusDiv.className = `status ${type}`;
}

async function startCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;
        updateStatus('Camera started', 'connected');
        
        if (peerConnection) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }
    } catch (err) {
        console.error('Error accessing camera:', err);
        alert('Could not access camera: ' + err.message);
    }
}

async function shareScreen() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
        
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        
        localStream = screenStream;
        localVideo.srcObject = screenStream;
        updateStatus('Screen sharing active', 'connected');
        
        if (peerConnection) {
            const videoSender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (videoSender) {
                videoSender.replaceTrack(screenStream.getVideoTracks()[0]);
            }
        }
        
        screenStream.getVideoTracks()[0].onended = () => {
            updateStatus('Screen sharing stopped', 'disconnected');
        };
    } catch (err) {
        console.error('Error sharing screen:', err);
        alert('Could not share screen: ' + err.message);
    }
}

function stopSharing() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
        updateStatus('Sharing stopped', 'disconnected');
    }
}

function initPeerConnection() {
    peerConnection = new RTCPeerConnection(config);
    
    const iceCandidates = [];
    
    peerConnection.onicecandidate = event => {
        console.log('ICE Candidate:', event.candidate);
        if (event.candidate) {
            iceCandidates.push(event.candidate);
        } else {
            // All ICE candidates gathered
            console.log('ICE gathering complete');
            document.getElementById('offerAnswer').value = 
                JSON.stringify(peerConnection.localDescription);
            updateStatus('Offer/Answer ready - copy it!', 'connected');
        }
    };
    
    peerConnection.onicegatheringstatechange = () => {
        console.log('ICE gathering state:', peerConnection.iceGatheringState);
    };
    
    peerConnection.ontrack = event => {
        console.log('Remote track received');
        remoteVideo.srcObject = event.streams[0];
        updateStatus('Connected', 'connected');
    };
    
    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log('Connection state:', state);
        if (state === 'connected') {
            updateStatus('Connected', 'connected');
        } else if (state === 'disconnected' || state === 'failed') {
            updateStatus('Disconnected', 'disconnected');
        } else if (state === 'connecting') {
            updateStatus('Connecting...', 'connecting');
        }
    };
    
    if (localStream) {
        localStream.getTracks().forEach(track => {
            console.log('Adding track:', track.kind);
            peerConnection.addTrack(track, localStream);
        });
    }
}

async function createOffer() {
    if (!localStream) {
        alert('Please start your camera first!');
        return;
    }
    
    console.log('Creating offer...');
    initPeerConnection();
    updateStatus('Creating offer...', 'connecting');
    
    try {
        const offer = await peerConnection.createOffer();
        console.log('Offer created:', offer);
        await peerConnection.setLocalDescription(offer);
        console.log('Local description set, gathering ICE candidates...');
        updateStatus('Gathering connection info...', 'connecting');
    } catch (err) {
        console.error('Error creating offer:', err);
        alert('Error creating offer: ' + err.message);
        updateStatus('Error', 'disconnected');
    }
}

async function createAnswer() {
    const remoteDesc = document.getElementById('remoteOfferAnswer').value;
    if (!remoteDesc) {
        alert('Please paste the remote offer first!');
        return;
    }
    
    if (!localStream) {
        alert('Please start your camera first!');
        return;
    }
    
    initPeerConnection();
    updateStatus('Creating answer...', 'connecting');
    
    await peerConnection.setRemoteDescription(JSON.parse(remoteDesc));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
}

async function setRemoteDescription() {
    const remoteDesc = document.getElementById('remoteOfferAnswer').value;
    if (!remoteDesc) {
        alert('Please paste the remote offer/answer!');
        return;
    }
    
    if (!peerConnection) {
        alert('Please create an offer first!');
        return;
    }
    
    updateStatus('Connecting...', 'connecting');
    await peerConnection.setRemoteDescription(JSON.parse(remoteDesc));
}

function copyToClipboard() {
    const text = document.getElementById('offerAnswer').value;
    if (!text) {
        alert('Nothing to copy!');
        return;
    }
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
}
