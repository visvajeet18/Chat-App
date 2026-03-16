/**
 * NeonPulse - Application Logic (Message Dialogs & Perfect WebRTC)
 */

document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let peerConnection = null;
    let localStream = null;
    const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    
    const remoteAudio = document.createElement('audio');
    remoteAudio.autoplay = true;
    document.body.appendChild(remoteAudio);

    let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
    let activeChatUser = null;
    let selectedImageBase64 = null;
    let pendingOffer = null;

    // DOM Elements
    const authView = document.getElementById('auth-view');
    const appView = document.getElementById('app-view');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const toRegister = document.getElementById('to-register');
    const toLogin = document.getElementById('to-login');
    const logoutBtn = document.getElementById('logout-btn');
    const userDisplayName = document.getElementById('user-display-name');
    const currentAvatar = document.getElementById('current-avatar');
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const recentChats = document.getElementById('recent-chats');
    const activeChat = document.getElementById('active-chat');
    const noChatSelected = document.getElementById('no-chat-selected');
    const receiverAvatar = document.getElementById('receiver-avatar');
    const receiverUsername = document.getElementById('receiver-username');
    const messageList = document.getElementById('message-list');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const imageUpload = document.getElementById('image-upload');
    const imagePreview = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');
    const clearPreview = document.getElementById('clear-preview');
    const startCallBtn = document.getElementById('start-call-btn');
    const deleteChatBtn = document.getElementById('delete-chat-btn');
    const backToSidebar = document.getElementById('back-to-sidebar');
    const callOverlay = document.getElementById('call-overlay');
    const callUserName = document.getElementById('call-user-name');
    const callAvatarImg = document.getElementById('call-avatar-img');
    const callStateText = document.getElementById('call-state-text');
    const acceptCallBtn = document.getElementById('accept-call');
    const hangupCallBtn = document.getElementById('hangup-call');
    const callSpectrum = document.getElementById('call-spectrum');
    const audioRingtone = document.getElementById('audio-ringtone');

    const msgOptionsModal = document.getElementById('msg-options-modal');
    const delMeBtn = document.getElementById('delete-for-me-btn');
    const delBothBtn = document.getElementById('delete-for-both-btn');
    const cancelOptionsBtn = document.getElementById('cancel-options-btn');

    function init() {
        if (currentUser) {
            authView.classList.remove('active'); appView.classList.add('active');
            userDisplayName.textContent = currentUser.username;
            currentAvatar.textContent = currentUser.username[0].toUpperCase();
            socket.emit('register_socket', currentUser.username);
            loadRecentChats();
        } else { authView.classList.add('active'); appView.classList.remove('active'); }
    }

    // --- Auth Event Listeners ---
    toRegister.addEventListener('click', () => { loginForm.classList.remove('active'); registerForm.classList.add('active'); });
    toLogin.addEventListener('click', () => { registerForm.classList.remove('active'); loginForm.classList.add('active'); });
    registerForm.addEventListener('submit', async (e) => { e.preventDefault(); const username = document.getElementById('reg-username').value.trim(); const password = document.getElementById('reg-password').value.trim(); try { const resp = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }); const data = await resp.json(); if (resp.ok) { currentUser = data; localStorage.setItem('currentUser', JSON.stringify(data)); registerForm.reset(); init(); } else { alert(data.error); } } catch (err) { alert('Server error'); } });
    loginForm.addEventListener('submit', async (e) => { e.preventDefault(); const username = document.getElementById('login-username').value.trim(); const password = document.getElementById('login-password').value.trim(); try { const resp = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }); const data = await resp.json(); if (resp.ok) { currentUser = data; localStorage.setItem('currentUser', JSON.stringify(data)); loginForm.reset(); init(); } else { alert(data.error); } } catch (err) { alert('Server error'); } });
    logoutBtn.addEventListener('click', () => { localStorage.removeItem('currentUser'); currentUser = null; activeChatUser = null; activeChat.classList.remove('active'); noChatSelected.classList.add('active'); document.body.classList.remove('chat-active'); init(); window.location.reload(); });

    // --- Sidebar & Recent Chats ---
    searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (!query) { searchResults.innerHTML = '<div class="placeholder-text">Type to search...</div>'; return; }
        try {
            const resp = await fetch('/api/users'); const users = await resp.json();
            const filtered = users.filter(u => u.username.toLowerCase().includes(query) && u.username.toLowerCase() !== currentUser.username.toLowerCase());
            if (filtered.length === 0) { searchResults.innerHTML = '<div class="placeholder-text">No users found</div>'; }
            else {
                searchResults.innerHTML = filtered.map(u => `<div class="user-item" data-username="${u.username}"><div class="avatar">${u.username[0].toUpperCase()}</div><div><h5>${u.username}</h5><p>Send message</p></div></div>`).join('');
                document.querySelectorAll('#search-results .user-item').forEach(item => { item.addEventListener('click', () => openChat(item.getAttribute('data-username'))); });
            }
        } catch (err) {}
    });

    async function loadRecentChats() {
        if (!currentUser) return;
        try {
            const resp = await fetch(`/api/recent-chats/${currentUser.username}`);
            const recents = await resp.json();
            if (recents.length === 0) { recentChats.innerHTML = '<div class="placeholder-text">No recent chats yet.</div>'; }
            else {
                recentChats.innerHTML = recents.map(r => `
                    <div class="user-item" data-username="${r.username}">
                        <div class="avatar">${r.username[0].toUpperCase()}</div>
                        <div style="flex: 1; overflow: hidden;">
                            <h5>${r.username}</h5>
                            <p style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; color: var(--text-secondary);">${r.lastMessage}</p>
                        </div>
                        <button class="chat-menu-btn" title="Clear chat history" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 5px; font-weight: bold; font-size: 16px;">⋮</button>
                    </div>
                `).join('');
                document.querySelectorAll('#recent-chats .user-item').forEach(item => {
                    item.addEventListener('click', (e) => { if (!e.target.classList.contains('chat-menu-btn')) openChat(item.getAttribute('data-username')); });
                });
                document.querySelectorAll('.chat-menu-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const targetUser = btn.closest('.user-item').getAttribute('data-username');
                        if (confirm(`Clear ENTIRE chat history with ${targetUser}?`)) {
                            const chatId = [currentUser.username, targetUser].sort().join('_');
                            socket.emit('delete_chat', { chatId });
                        }
                    });
                });
            }
        } catch (err) {}
    }

    // --- Chat Arena ---
    async function openChat(username) {
        activeChatUser = username; noChatSelected.classList.remove('active'); activeChat.classList.add('active'); document.body.classList.add('chat-active');
        receiverUsername.textContent = username; receiverAvatar.textContent = username[0].toUpperCase();
        const chatId = [currentUser.username, activeChatUser].sort().join('_'); socket.emit('join_chat', chatId);
        try { const resp = await fetch(`/api/messages/${chatId}`); renderMessages(await resp.json()); } catch (err) {}
    }

    backToSidebar.addEventListener('click', () => { document.body.classList.remove('chat-active'); activeChatUser = null; });

    function renderMessages(messages) {
        const deletedIds = JSON.parse(localStorage.getItem('deletedMessages') || '[]');
        const visible = messages.filter(m => !deletedIds.includes(m.id));

        messageList.innerHTML = visible.map(m => `
            <div class="message ${m.sender === currentUser.username ? 'sent' : 'received'}" data-id="${m.id || ''}" style="cursor: pointer;">
                <div class="message-bubble">
                    ${m.image ? `<img src="${m.image}" class="msg-img">` : ''}
                    ${m.text ? `<div>${m.text}</div>` : ''}
                </div>
                <span class="msg-time">${new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
        `).join('');
        messageList.scrollTop = messageList.scrollHeight;
    }

    messageList.addEventListener('click', (e) => {
        const msgEl = e.target.closest('.message');
        if (!msgEl) return;
        const msgId = msgEl.getAttribute('data-id');
        const isSent = msgEl.classList.contains('sent');
        if (!msgId) return;

        msgOptionsModal.classList.add('active');
        delBothBtn.style.display = 'block';

        delMeBtn.onclick = () => {
            let deleted = JSON.parse(localStorage.getItem('deletedMessages') || '[]');
            deleted.push(msgId); localStorage.setItem('deletedMessages', JSON.stringify(deleted));
            msgEl.remove(); msgOptionsModal.classList.remove('active');
        };

        delBothBtn.onclick = () => {
            const chatId = [currentUser.username, activeChatUser].sort().join('_');
            socket.emit('delete_message', { chatId, messageId: msgId });
            msgOptionsModal.classList.remove('active');
        };

        cancelOptionsBtn.onclick = () => { msgOptionsModal.classList.remove('active'); };
    });

    deleteChatBtn.addEventListener('click', () => {
        if (!activeChatUser) return;
        if (confirm(`Are you sure you want to delete the ENTIRE chat history with ${activeChatUser}?`)) {
            const chatId = [currentUser.username, activeChatUser].sort().join('_');
            socket.emit('delete_chat', { chatId });
        }
    });

    // --- Messaging Send ---
    function sendMsg() {
        const text = messageInput.value.trim(); if (!text && !selectedImageBase64) return;
        const chatId = [currentUser.username, activeChatUser].sort().join('_');
        const newMessage = { id: Date.now() + Math.random().toString(36).substr(2, 9), sender: currentUser.username, text, image: selectedImageBase64, timestamp: new Date().toISOString() };
        socket.emit('send_message', { chatId, message: newMessage });
        messageInput.value = ''; clearImagePreview(); setTimeout(loadRecentChats, 300);
    }
    sendBtn.addEventListener('click', sendMsg);
    messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMsg(); });
    imageUpload.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => { selectedImageBase64 = event.target.result; previewImg.src = selectedImageBase64; imagePreview.classList.remove('preview-hidden'); }; reader.readAsDataURL(file); } });
    function clearImagePreview() { selectedImageBase64 = null; imagePreview.classList.add('preview-hidden'); previewImg.src = ''; }
    clearPreview.addEventListener('click', clearImagePreview);

    // --- WebRTC Call Logic ---
    function createPeerConnection() {
        peerConnection = new RTCPeerConnection(rtcConfig);
        peerConnection.onicecandidate = (event) => { if (event.candidate) socket.emit('webrtc_signal', { target: activeChatUser, signal: { candidate: event.candidate } }); };
        peerConnection.ontrack = (event) => { if (event.streams && event.streams[0]) remoteAudio.srcObject = event.streams[0]; };
    }

    async function getUserAudioStream() { 
        try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); } 
        catch (err) { alert("Microphone access is required for voice calls."); return null; } 
    }

    startCallBtn.addEventListener('click', async () => {
        if (!activeChatUser) return;
        localStream = await getUserAudioStream(); if (!localStream) return;
        createPeerConnection(); localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        const offer = await peerConnection.createOffer(); await peerConnection.setLocalDescription(offer);
        socket.emit('initiate_call', { caller: currentUser.username, receiver: activeChatUser });
        socket.emit('webrtc_signal', { target: activeChatUser, signal: { sdp: offer } });
        showCallOverlay('outgoing', activeChatUser);
    });

    function showCallOverlay(direction, opposingUser) {
        callOverlay.classList.add('active');
        callUserName.textContent = opposingUser;
        callAvatarImg.textContent = opposingUser[0].toUpperCase();
        if (direction === 'incoming') { callStateText.textContent = "Incoming Voice Call..."; acceptCallBtn.style.display = 'flex'; audioRingtone.play().catch(() => {}); }
        else { callStateText.textContent = "Ringing user..."; acceptCallBtn.style.display = 'none'; }
    }

    acceptCallBtn.addEventListener('click', async () => {
        if (!pendingOffer) { alert("Call state lost. Try again."); return; }
        localStream = await getUserAudioStream(); if (!localStream) return;
        if (!peerConnection) createPeerConnection(); localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        try {
            const answer = await peerConnection.createAnswer(); await peerConnection.setLocalDescription(answer);
            socket.emit('respond_call', { caller: activeChatUser, receiver: currentUser.username, status: 'connected' });
            socket.emit('webrtc_signal', { target: activeChatUser, signal: { sdp: answer } });
            connectCall();
        } catch (e) { alert("Connection error. Try re-initiating."); }
    });

    hangupCallBtn.addEventListener('click', () => { socket.emit('hangup_call', { target: activeChatUser }); socket.emit('webrtc_signal', { target: activeChatUser, signal: { close: true } }); closeCallOverlay(); });

    function connectCall() {
        callStateText.textContent = "Connected"; acceptCallBtn.style.display = 'none'; callSpectrum.classList.remove('spectrum-hidden'); audioRingtone.pause(); audioRingtone.currentTime = 0;
    }

    function closeCallOverlay() {
        callOverlay.classList.remove('active'); audioRingtone.pause(); audioRingtone.currentTime = 0; callSpectrum.classList.add('spectrum-hidden');
        if (peerConnection) { peerConnection.close(); peerConnection = null; }
        if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
        remoteAudio.srcObject = null; pendingOffer = null;
    }

    // --- Socket Listeners ---
    function setupSocketListeners() {
        socket.on('receive_message', (data) => {
            const { chatId, message } = data; const activeId = [currentUser.username, activeChatUser].sort().join('_');
            if (chatId === activeId) appendSingleMessage(message); loadRecentChats();
        });

        socket.on('message_deleted', (data) => {
            const { messageId } = data; const el = messageList.querySelector(`[data-id="${messageId}"]`);
            if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); } loadRecentChats();
        });

        socket.on('chat_cleared', (data) => {
            const { chatId } = data; const activeId = [currentUser.username, activeChatUser].sort().join('_');
            if (chatId === activeId) { messageList.innerHTML = ''; } loadRecentChats();
        });

        socket.on('incoming_call_signal', (data) => {
            const { caller } = data;
            // POLITE PEER LOGIC (Glitch Handling)
            if (peerConnection && peerConnection.signalingState !== "stable") {
                const isPolite = currentUser.username > caller;
                if (!isPolite) return; // Impolite ignores collision
                closeCallOverlay(); // polite rolls back
            }
            activeChatUser = caller;
            showCallOverlay('incoming', caller);
        });

        socket.on('webrtc_signal_received', async (data) => {
            const { signal } = data; if (!signal) return;
            if (signal.sdp) {
                if (signal.sdp.type === 'offer') {
                    pendingOffer = signal.sdp;
                    if (!peerConnection) createPeerConnection();
                    
                    if (peerConnection.signalingState !== "stable") {
                        const isPolite = currentUser.username > activeChatUser;
                        if (!isPolite) return; // Impolite ignores
                    }
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));
                } else if (signal.sdp.type === 'answer' && peerConnection) {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                }
            } else if (signal.candidate && peerConnection) {
                try { await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch(e) {}
            } else if (signal.close) { closeCallOverlay(); }
        });

        socket.on('call_status_update', (data) => { if (data.status === 'connected') connectCall(); });
        socket.on('call_terminated', () => closeCallOverlay());
    }

    function appendSingleMessage(m) {
        const div = document.createElement('div'); div.className = `message ${m.sender === currentUser.username ? 'sent' : 'received'}`; div.setAttribute('data-id', m.id || ''); div.style.cursor = 'pointer';
        div.innerHTML = `<div class="message-bubble">${m.image ? `<img src="${m.image}" class="msg-img">` : ''}${m.text ? `<div>${m.text}</div>` : ''}</div><span class="msg-time">${new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>`;
        messageList.appendChild(div); const img = div.querySelector('.msg-img');
        if (img) img.onload = () => { messageList.scrollTop = messageList.scrollHeight; }; else messageList.scrollTop = messageList.scrollHeight;
    }

    init(); setupSocketListeners();
});
