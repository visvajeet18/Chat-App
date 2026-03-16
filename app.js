/**
 * NeonPulse - Application Logic (Fully Serverless with Supabase)
 */

document.addEventListener('DOMContentLoaded', async () => {
    // --- SUPABASE CONFIGURATION ---
    const SUPABASE_URL = 'https://razhpsmjilhunqmtagez.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhemhwc21qaWxodW5xbXRhZ2V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2Mzg1MDIsImV4cCI6MjA4OTIxNDUwMn0.ME8LyAO8jr17qmXMty31ZpFH0KOAHOupB3X_Pxdwo0c'; 

    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- WebRTC Setup ---
    let peerConnection = null;
    let localStream = null;
    const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    
    const remoteAudio = document.createElement('audio');
    remoteAudio.autoplay = true;
    document.body.appendChild(remoteAudio);

    // --- State & Variables ---
    let currentUser = null; // We will fill this from supabase.auth.getUser()
    let activeChatUser = null;
    let selectedImageBase64 = null;
    let pendingOffer = null;
    let activeMessageChannel = null;
    let activeCallChannel = null;

    // --- DOM Elements ---
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

    // --- 1. View Initialization ---
    async function init() {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
            authView.classList.remove('active'); appView.classList.add('active');
            userDisplayName.textContent = currentUser.username;
            currentAvatar.textContent = currentUser.username[0].toUpperCase();
            loadRecentChats();
            setupCallChannel();
            setupGlobalMessageListener();
        } else { 
            authView.classList.add('active'); appView.classList.remove('active'); 
        }
    }

    function setupGlobalMessageListener() {
        if (activeMessageChannel) activeMessageChannel.unsubscribe();
        activeMessageChannel = supabaseClient
            .channel('global_messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
                const m = payload.new;
                const parts = m.chat_id.split('_');
                if (parts.includes(currentUser.username)) {
                    loadRecentChats();
                    const activeId = [currentUser.username, activeChatUser].sort().join('_');
                    if (m.chat_id === activeId) {
                        appendSingleMessage(m);
                        // Mark as read instantly if currently looking at it
                        if (m.sender !== currentUser.username) {
                            supabaseClient.from('messages').update({ is_read: true }).eq('id', m.id).then(() => {});
                        }
                    } else if (m.sender !== currentUser.username) {
                        showNotification(m);
                    }
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
                const m = payload.new;
                // m.id is always provided in UPDATE payload
                const msgEl = messageList.querySelector(`[data-id="${m.id}"]`);
                if (msgEl) {
                    const statusEl = msgEl.querySelector('.msg-status');
                    if (statusEl && m.is_read) {
                        statusEl.innerHTML = '✓✓';
                        statusEl.style.color = 'var(--neon-magenta)';
                    }
                }
                loadRecentChats();
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
                if (activeChatUser) {
                    const chatId = [currentUser.username, activeChatUser].sort().join('_');
                    supabaseClient.from('messages').select('*').eq('chat_id', chatId).order('timestamp', { ascending: true }).then(({data}) => renderMessages(data || []));
                }
                loadRecentChats();
            })
            .subscribe();
    }

    function showNotification(m) {
        const toast = document.createElement('div');
        toast.style.cssText = "position:fixed; top:20px; right:20px; background:rgba(30,0,50,0.95); color:white; padding:15px; border-radius:12px; border:1px solid var(--neon-magenta); box-shadow:0 4px 15px rgba(255,0,255,0.2); z-index:10000; cursor:pointer; display:flex; align-items:center; gap:10px; font-family:sans-serif; animation: slideIn 0.3s ease;";
        toast.innerHTML = `<div class='avatar' style='width:34px; height:34px; font-size:14px; background:var(--neon-magenta); border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold;'>${m.sender[0].toUpperCase()}</div><div><strong style='color:var(--neon-magenta); font-size:13px;'>${m.sender}</strong><div style='font-size:12px; color:#ccc; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;'>${m.text || '[Image]'}</div></div>`;
        toast.addEventListener('click', () => { openChat(m.sender); toast.style.transform = 'translateX(200%)'; setTimeout(() => toast.remove(), 200); });
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.transform = 'translateX(200%)'; setTimeout(() => toast.remove(), 400); }, 4000);
    }

    // --- 2. Custom Auth Logic (No Email requirements) ---
    toRegister.addEventListener('click', () => { loginForm.classList.remove('active'); registerForm.classList.add('active'); });
    toLogin.addEventListener('click', () => { registerForm.classList.remove('active'); loginForm.classList.add('active'); });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value.trim();
        try {
            // Check if username exists
            const { data: existing } = await supabaseClient.from('profiles').select('*').eq('username', username);
            if (existing && existing.length > 0) throw new Error("Username already taken");

            const { data, error } = await supabaseClient
                .from('profiles')
                .insert([{ username, password }])
                .select();
            if (error) throw error;

            currentUser = { id: data[0].id, username: data[0].username };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            alert("Registered successfully!");
            init();
        } catch (err) { alert(err.message); }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();
        try {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('username', username)
                .eq('password', password);
            if (error) throw error;
            if (!data || data.length === 0) throw new Error("Invalid username or password");

            currentUser = { id: data[0].id, username: data[0].username };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            init();
        } catch (err) { alert(err.message); }
    });

    logoutBtn.addEventListener('click', () => { 
        localStorage.removeItem('currentUser');
        currentUser = null; activeChatUser = null; 
        activeChat.classList.remove('active'); noChatSelected.classList.add('active'); 
        document.body.classList.remove('chat-active'); 
        window.location.reload(); 
    });

    // --- 3. Sidebar Search & Recent Chats ---
    searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (!query) { searchResults.innerHTML = '<div class="placeholder-text">Type to search...</div>'; return; }
        try {
            const { data: users } = await supabaseClient.from('profiles').select('username');
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
            const { data: messages } = await supabaseClient
                .from('messages')
                .select('*')
                .or(`chat_id.like.%${currentUser.username}%`);

            const recentsMap = {};
            messages.forEach(m => {
                const parts = m.chat_id.split('_');
                const otherUser = parts.find(p => p !== currentUser.username);
                if (otherUser) {
                    if (!recentsMap[otherUser]) {
                        recentsMap[otherUser] = { username: otherUser, lastMessage: '', timestamp: '', unreadCount: 0 };
                    }
                    if (!recentsMap[otherUser].timestamp || new Date(m.timestamp) > new Date(recentsMap[otherUser].timestamp)) {
                        recentsMap[otherUser].lastMessage = m.text || (m.image ? '[Image]' : '');
                        recentsMap[otherUser].timestamp = m.timestamp;
                    }
                    if (m.sender !== currentUser.username && !m.is_read) {
                        recentsMap[otherUser].unreadCount++;
                    }
                }
            });

            const recents = Object.values(recentsMap).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            if (recents.length === 0) { recentChats.innerHTML = '<div class="placeholder-text">No recent chats yet.</div>'; }
            else {
                recentChats.innerHTML = recents.map(r => `
                    <div class="user-item" data-username="${r.username}">
                        <div class="avatar">${r.username[0].toUpperCase()}</div>
                        <div style="flex: 1; overflow: hidden;">
                            <h5>${r.username}</h5>
                            <p style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; color: var(--text-secondary);">${r.unreadCount > 0 ? `<b style="color:var(--neon-magenta)">[${r.unreadCount}]</b> ` : ''}${r.lastMessage}</p>
                        </div>
                        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:5px;">
                            ${r.unreadCount > 0 ? `<span class="unread-badge" style="background:var(--neon-magenta); color:white; font-size:11px; font-weight:bold; padding:2px 6px; border-radius:10px; min-width:18px; text-align:center;">${r.unreadCount}</span>` : ''}
                            <button class="chat-menu-btn" title="Clear" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:3px; font-weight:bold;">⋮</button>
                        </div>
                    </div>
                `).join('');
                document.querySelectorAll('#recent-chats .user-item').forEach(item => {
                    item.addEventListener('click', (e) => { if (!e.target.classList.contains('chat-menu-btn')) openChat(item.getAttribute('data-username')); });
                });
                document.querySelectorAll('.chat-menu-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const targetUser = btn.closest('.user-item').getAttribute('data-username');
                        if (confirm(`Clear ENTIRE chat history with ${targetUser}?`)) {
                            const chatId = [currentUser.username, targetUser].sort().join('_');
                            await supabaseClient.from('messages').delete().eq('chat_id', chatId);
                            if (activeChatUser === targetUser) messageList.innerHTML = '';
                            loadRecentChats();
                        }
                    });
                });
            }
        } catch (err) {}
    }

    // --- 4. Chat Arena ---
    async function openChat(username) {
        activeChatUser = username; noChatSelected.classList.remove('active'); activeChat.classList.add('active'); document.body.classList.add('chat-active');
        receiverUsername.textContent = username; receiverAvatar.textContent = username[0].toUpperCase();

        const chatId = [currentUser.username, activeChatUser].sort().join('_');
        
        // Mark existing as read
        await supabaseClient
            .from('messages')
            .update({ is_read: true })
            .eq('chat_id', chatId)
            .neq('sender', currentUser.username);

        // Fetch History
        const { data: messages } = await supabaseClient.from('messages').select('*').eq('chat_id', chatId).order('timestamp', { ascending: true });
        renderMessages(messages || []);
        loadRecentChats(); // refresh counts
    }

    backToSidebar.addEventListener('click', () => { document.body.classList.remove('chat-active'); activeChatUser = null; if (activeMessageChannel) activeMessageChannel.unsubscribe(); });

    function renderMessages(messages) {
        const deletedIds = JSON.parse(localStorage.getItem('deletedMessages') || '[]');
        const visible = messages.filter(m => !deletedIds.includes(m.id));

        messageList.innerHTML = visible.map(m => {
            const ticks = m.sender === currentUser.username ? `<span class="msg-status" style="color:${m.is_read ? 'var(--neon-magenta)' : 'var(--text-secondary)'}; font-size:12px; margin-left:3px;">${m.is_read ? '✓✓' : '✓'}</span>` : '';
            return `
                <div class="message ${m.sender === currentUser.username ? 'sent' : 'received'}" data-id="${m.id}" style="cursor: pointer;">
                    <div class="message-bubble">
                        ${m.image ? `<img src="${m.image}" class="msg-img">` : ''}
                        ${m.text ? `<div>${m.text}</div>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; justify-content:flex-end; gap:2px;">
                        <span class="msg-time">${new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        ${ticks}
                    </div>
                </div>
            `;
        }).join('');
        messageList.scrollTop = messageList.scrollHeight;
    }

    // Message click for Options Menu
    messageList.addEventListener('click', (e) => {
        const msgEl = e.target.closest('.message'); if (!msgEl) return;
        const msgId = msgEl.getAttribute('data-id'); if (!msgId) return;

        msgOptionsModal.classList.add('active');
        delBothBtn.style.display = 'block';

        delMeBtn.onclick = () => {
            let deleted = JSON.parse(localStorage.getItem('deletedMessages') || '[]');
            deleted.push(msgId); localStorage.setItem('deletedMessages', JSON.stringify(deleted));
            msgEl.remove(); msgOptionsModal.classList.remove('active');
        };

        delBothBtn.onclick = async () => {
            await supabaseClient.from('messages').delete().eq('id', msgId);
            msgEl.remove();
            msgOptionsModal.classList.remove('active');
        };

        cancelOptionsBtn.onclick = () => { msgOptionsModal.classList.remove('active'); };
    });

    deleteChatBtn.addEventListener('click', async () => {
        if (!activeChatUser) return;
        if (confirm(`Are you sure you want to delete the ENTIRE chat history with ${activeChatUser}?`)) {
            const chatId = [currentUser.username, activeChatUser].sort().join('_');
            await supabaseClient.from('messages').delete().eq('chat_id', chatId);
            messageList.innerHTML = '';
            loadRecentChats();
        }
    });

    // --- 5. Messaging Send ---
    async function sendMsg() {
        const text = messageInput.value.trim(); if (!text && !selectedImageBase64) return;
        const chatId = [currentUser.username, activeChatUser].sort().join('_');
        
        await supabaseClient.from('messages').insert([{ 
            chat_id: chatId, 
            sender: currentUser.username, 
            text: text || null, 
            image: selectedImageBase64 || null 
        }]);

        messageInput.value = ''; clearImagePreview(); loadRecentChats();
    }

    sendBtn.addEventListener('click', sendMsg);
    messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMsg(); });
    imageUpload.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => { selectedImageBase64 = event.target.result; previewImg.src = selectedImageBase64; imagePreview.classList.remove('preview-hidden'); }; reader.readAsDataURL(file); } });
    function clearImagePreview() { selectedImageBase64 = null; imagePreview.classList.add('preview-hidden'); previewImg.src = ''; }
    clearPreview.addEventListener('click', clearImagePreview);

    // --- 6. WebRTC Call Logic (via Supabase Realtime Broadcast) ---
    function setupCallChannel() {
        if (activeCallChannel) activeCallChannel.unsubscribe();
        activeCallChannel = supabaseClient.channel(`calls_${currentUser.username}`)
            .on('broadcast', { event: 'incoming_call' }, payload => {
                const { caller } = payload.payload;
                if (peerConnection && peerConnection.signalingState !== "stable") {
                    if (currentUser.username > caller) closeCallOverlay(); // polite rollback
                    else return;
                }
                activeChatUser = caller;
                showCallOverlay('incoming', caller);
            })
            .on('broadcast', { event: 'webrtc_signal' }, async payload => {
                const { signal } = payload.payload;
                if (signal.sdp) {
                    if (signal.sdp.type === 'offer') {
                        pendingOffer = signal.sdp;
                        if (!peerConnection) createPeerConnection();
                        if (peerConnection.signalingState !== "stable" && currentUser.username > activeChatUser) return;
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));
                    } else if (signal.sdp.type === 'answer' && peerConnection) {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                    }
                } else if (signal.candidate && peerConnection) {
                    try { await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch(e) {}
                } else if (signal.close) { closeCallOverlay(); }
            })
            .on('broadcast', { event: 'call_status' }, payload => {
                if (payload.payload.status === 'connected') connectCall();
            })
            .subscribe();
    }

    function createPeerConnection() {
        peerConnection = new RTCPeerConnection(rtcConfig);
        peerConnection.onicecandidate = (event) => { 
            if (event.candidate) sendSignal({ candidate: event.candidate }); 
        };
        peerConnection.ontrack = (event) => { if (event.streams && event.streams[0]) remoteAudio.srcObject = event.streams[0]; };
    }

    function sendSignal(signal) {
        if (!activeChatUser) return;
        supabaseClient.channel(`calls_${activeChatUser}`).send({
            type: 'broadcast',
            event: 'webrtc_signal',
            payload: { signal }
        });
    }

    async function getUserAudioStream() { try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); } catch (err) { alert("Microphone access is required."); return null; } }

    startCallBtn.addEventListener('click', async () => {
        if (!activeChatUser) return;
        localStream = await getUserAudioStream(); if (!localStream) return;
        createPeerConnection(); localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        const offer = await peerConnection.createOffer(); await peerConnection.setLocalDescription(offer);
        
        // Notify Receiver
        supabaseClient.channel(`calls_${activeChatUser}`).send({
            type: 'broadcast',
            event: 'incoming_call',
            payload: { caller: currentUser.username }
        });
        
        sendSignal({ sdp: offer });
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
        if (!pendingOffer) { alert("Call state lost."); return; }
        localStream = await getUserAudioStream(); if (!localStream) return;
        if (!peerConnection) createPeerConnection(); localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        try {
            const answer = await peerConnection.createAnswer(); await peerConnection.setLocalDescription(answer);
            
            supabaseClient.channel(`calls_${activeChatUser}`).send({
                type: 'broadcast',
                event: 'call_status',
                payload: { status: 'connected' }
            });
            
            sendSignal({ sdp: answer });
            connectCall();
        } catch (e) { alert("Connection error."); }
    });

    hangupCallBtn.addEventListener('click', () => { 
        sendSignal({ close: true }); 
        closeCallOverlay(); 
    });

    function connectCall() { callStateText.textContent = "Connected"; acceptCallBtn.style.display = 'none'; callSpectrum.classList.remove('spectrum-hidden'); audioRingtone.pause(); audioRingtone.currentTime = 0; }

    function closeCallOverlay() {
        callOverlay.classList.remove('active'); audioRingtone.pause(); audioRingtone.currentTime = 0; callSpectrum.classList.add('spectrum-hidden');
        if (peerConnection) { peerConnection.close(); peerConnection = null; }
        if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
        remoteAudio.srcObject = null; pendingOffer = null;
    }

    function appendSingleMessage(m) {
        const div = document.createElement('div'); div.className = `message ${m.sender === currentUser.username ? 'sent' : 'received'}`; div.setAttribute('data-id', m.id); div.style.cursor = 'pointer';
        
        const ticks = m.sender === currentUser.username ? `<span class="msg-status" style="color:${m.is_read ? 'var(--neon-magenta)' : 'var(--text-secondary)'}; font-size:12px; margin-left:3px;">${m.is_read ? '✓✓' : '✓'}</span>` : '';

        div.innerHTML = `<div class="message-bubble">${m.image ? `<img src="${m.image}" class="msg-img">` : ''}${m.text ? `<div>${m.text}</div>` : ''}</div><div style="display:flex; align-items:center; justify-content:flex-end; gap:2px;"><span class="msg-time">${new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>${ticks}</div>`;
        messageList.appendChild(div); const img = div.querySelector('.msg-img');
        if (img) img.onload = () => { messageList.scrollTop = messageList.scrollHeight; }; else messageList.scrollTop = messageList.scrollHeight;
    }

    init();
});
