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
    let presenceChannel = null;
    let replyingToMessage = null;
    let editingMessageId = null;
    let selectedMsgId = null; 
    let currentTheme = 'magenta';

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
    const downloadFileBtn = document.getElementById('download-file-btn');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const replyMsgBtn = document.getElementById('reply-msg-btn');
    const editMsgBtn = document.getElementById('edit-msg-btn');
    const replyPreviewBar = document.getElementById('reply-preview-bar');
    const replyPreviewContent = document.getElementById('reply-preview-content');
    const cancelReplyBtn = document.getElementById('cancel-reply-btn');
    const reactionPicker = document.getElementById('reaction-picker-modal');

    // --- 1. View Initialization ---
    function init() {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
            authView.classList.remove('active'); appView.classList.add('active');
            userDisplayName.textContent = currentUser.username;
            if (currentUser.avatar_url) {
                currentAvatar.innerHTML = `<img src="${currentUser.avatar_url}" style="width:100%;height:100%;border-radius:12px;object-fit:cover;">`;
            } else {
                currentAvatar.textContent = currentUser.username[0].toUpperCase();
            }
            loadRecentChats();
            setupCallChannel();
            setupPresence();
            setupGlobalMessageListener();
            setupReactionPicker(); // Attach once
        } else { 
            authView.classList.add('active'); appView.classList.remove('active'); 
        }
    }

    function setupReactionPicker() {
        reactionPicker.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!selectedMsgId) return;
                const emoji = btn.textContent;
                const mid = selectedMsgId;
                msgOptionsModal.classList.remove('active');
                await toggleReaction(mid, emoji);
                selectedMsgId = null;
            });
        });
    }

    function getChatId(u1, u2) {
        if (!u1 || !u2) return "unknown";
        return [u1.toLowerCase(), u2.toLowerCase()].sort().join('_');
    }

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    const debouncedLoadRecentChats = debounce(() => loadRecentChats(), 300);
    
    function formatMessage(text) {
        if (!text) return "";
        // Escape HTML
        let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        // Bold: **text**
        html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        // Italic: *text*
        html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
        // Inline Code: `text`
        html = html.replace(/`(.*?)`/g, "<code class='inline-code'>$1</code>");
        // Newlines
        html = html.replace(/\n/g, "<br>");
        
        return html;
    }

    function triggerEmojiBurst(el, emoji) {
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let i = 0; i < 8; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.textContent = emoji;
            
            const angle = (i / 8) * Math.PI * 2;
            const dist = 50 + Math.random() * 50;
            const tx = Math.cos(angle) * dist;
            const ty = Math.sin(angle) * dist;
            
            particle.style.setProperty('--tx', `${tx}px`);
            particle.style.setProperty('--ty', `${ty}px`);
            particle.style.left = `${centerX}px`;
            particle.style.top = `${centerY}px`;
            
            document.body.appendChild(particle);
            setTimeout(() => particle.remove(), 800);
        }
    }

    const dropOverlay = document.getElementById('drop-overlay');
    const chatContainer = document.querySelector('.chat-container');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        chatContainer.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    chatContainer.addEventListener('dragenter', () => dropOverlay.classList.add('active'));
    chatContainer.addEventListener('dragover', () => dropOverlay.classList.add('active'));
    chatContainer.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null || !dropOverlay.contains(e.relatedTarget)) {
            dropOverlay.classList.remove('active');
        }
    });

    chatContainer.addEventListener('drop', (e) => {
        dropOverlay.classList.remove('active');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            selectedFileObj = files[0];
            // If it's an image, show preview, else just send
            if (selectedFileObj.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    selectedImageBase64 = event.target.result;
                    previewImg.src = event.target.result;
                    imagePreview.classList.remove('preview-hidden');
                };
                reader.readAsDataURL(selectedFileObj);
            } else {
                sendMsg();
            }
        }
    });

    function setupGlobalMessageListener() {
        if (activeMessageChannel) activeMessageChannel.unsubscribe();
        activeMessageChannel = supabaseClient
            .channel('global_messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
                const m = payload.new;
                const myUserLower = currentUser.username.toLowerCase();
                const parts = m.chat_id.split('_');
                if (parts.includes(myUserLower)) {
                    debouncedLoadRecentChats();
                    const activeId = getChatId(currentUser.username, activeChatUser);
                    if (m.chat_id === activeId) {
                        // Avoid double-append for own optimistic messages
                        if (m.sender === currentUser.username && document.querySelector(`[data-id="${m.id}"]`)) return;
                        appendSingleMessage(m);
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
                const activeId = getChatId(currentUser.username, activeChatUser);
                if (m.chat_id === activeId) {
                    const msgEl = messageList.querySelector(`[data-id="${m.id}"]`);
                    if (msgEl) {
                        // 1. Update Read Status Ticks (Metadata update)
                        const statusEl = msgEl.querySelector('.msg-status');
                        if (statusEl && m.is_read) { 
                            statusEl.innerHTML = '✓✓'; 
                            statusEl.style.color = 'var(--neon-magenta)'; 
                        }
                        
                        // 2. Check for Content/Reaction changes (Visual updates)
                        const oldReactions = msgEl.getAttribute('data-reactions-cache') || '[]';
                        const newReactions = JSON.stringify(m.reactions || []);
                        
                        const hasContentChange = m.is_edited || (newReactions !== oldReactions);
                        
                        if (hasContentChange) {
                            if (newReactions !== oldReactions) {
                                // Trigger burst for new reactions
                                const nR = JSON.parse(newReactions);
                                const oR = JSON.parse(oldReactions);
                                if (nR.length > oR.length) {
                                    const latest = nR[nR.length - 1];
                                    const msgEl = messageList.querySelector(`[data-id="${m.id}"]`);
                                    if (msgEl) triggerEmojiBurst(msgEl, latest.emoji);
                                }
                            }
                            // Only perform full openChat if visual content actually changed
                            openChat(activeChatUser);
                        }
                    }
                }
                debouncedLoadRecentChats();
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
                const activeId = getChatId(currentUser.username, activeChatUser);
                if (activeChatUser && payload.old.chat_id === activeId) {
                    openChat(activeChatUser);
                }
                debouncedLoadRecentChats();
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

    // --- Presence Logic ---
    function setupPresence() {
        if (presenceChannel) presenceChannel.unsubscribe();
        presenceChannel = supabaseClient.channel('online-users', {
            config: { presence: { key: currentUser.username } }
        });

        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = presenceChannel.presenceState();
                updateOnlineStatusUI(state);
            })
            .on('presence', { event: 'join', key: currentUser.username }, ({ newPresences }) => {
                console.log('Joined:', newPresences);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({ online_at: new Date().toISOString() });
                }
            });
    }

    function updateOnlineStatusUI(presenceState) {
        const onlineUsers = Object.keys(presenceState);
        
        // Update Sidebar (Recents/Search)
        document.querySelectorAll('#recent-chats .user-item, #search-results .user-item').forEach(item => {
            const username = item.getAttribute('data-username');
            const avatar = item.querySelector('.avatar');
            if (onlineUsers.includes(username)) {
                avatar.classList.add('online');
            } else {
                avatar.classList.remove('online');
            }
        });

        // Update "Me" status (Sidebar header)
        const myAvatar = document.getElementById('current-avatar');
        const myStatusEl = document.querySelector('.status-indicator');
        if (onlineUsers.includes(currentUser.username)) {
            myAvatar.classList.add('online');
            myStatusEl.textContent = 'Online';
            myStatusEl.style.color = 'var(--cyan-neon)';
        } else {
            myAvatar.classList.remove('online');
            myStatusEl.textContent = 'Offline';
            myStatusEl.style.color = 'var(--text-muted)';
        }

        // Update Header if active partner is online
        if (activeChatUser) {
            const statusEl = document.querySelector('.receiver-status');
            if (onlineUsers.includes(activeChatUser)) {
                statusEl.innerHTML = '<span class="presence-dot"></span>Online';
                statusEl.style.color = 'var(--cyan-neon)';
            } else {
                statusEl.textContent = 'Offline';
                statusEl.style.color = 'var(--text-muted)';
            }
        }
    }

    // --- Theme Logic ---
    themeToggleBtn.addEventListener('click', () => {
        if (currentTheme === 'magenta') {
            document.documentElement.style.setProperty('--magenta-neon', '#00f0ff');
            document.documentElement.style.setProperty('--magenta-glow', 'rgba(0, 240, 255, 0.4)');
            document.documentElement.style.setProperty('--glass-border', 'rgba(0, 240, 255, 0.15)');
            currentTheme = 'cyan';
        } else {
            document.documentElement.style.setProperty('--magenta-neon', '#ff007a');
            document.documentElement.style.setProperty('--magenta-glow', 'rgba(255, 0, 122, 0.4)');
            document.documentElement.style.setProperty('--glass-border', 'rgba(255, 0, 122, 0.15)');
            currentTheme = 'magenta';
        }
    });

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

            currentUser = { id: data[0].id, username: data[0].username, avatar_url: data[0].avatar_url };
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

            currentUser = { id: data[0].id, username: data[0].username, avatar_url: data[0].avatar_url };
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
                const otherUser = parts.find(p => p.toLowerCase() !== currentUser.username.toLowerCase());
                
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

            // Fetch avatars for these users
            const usernames = recents.map(r => r.username);
            const { data: profiles } = await supabaseClient.from('profiles').select('username, avatar_url').in('username', usernames);
            const avatarMap = {};
            if (profiles) profiles.forEach(p => avatarMap[p.username] = p.avatar_url);

            if (recents.length === 0) { recentChats.innerHTML = '<div class="placeholder-text">No recent chats yet.</div>'; }
            else {
                recentChats.innerHTML = recents.map(r => {
                    const avatarHTML = avatarMap[r.username] 
                        ? `<img src="${avatarMap[r.username]}" style="width:100%;height:100%;border-radius:12px;object-fit:cover;">`
                        : r.username[0].toUpperCase();
                    return `
                        <div class="user-item" data-username="${r.username}">
                            <div class="avatar">${avatarHTML}</div>
                            <div style="flex: 1; overflow: hidden;">
                                <h5>${r.username}</h5>
                                <p style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; color: var(--text-secondary);">${r.unreadCount > 0 ? `<b style="color:var(--neon-magenta)">[${r.unreadCount}]</b> ` : ''}${r.lastMessage}</p>
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:5px;">
                                ${r.unreadCount > 0 ? `<span class="unread-badge" style="background:var(--neon-magenta); color:white; font-size:11px; font-weight:bold; padding:2px 6px; border-radius:10px; min-width:18px; text-align:center;">${r.unreadCount}</span>` : ''}
                                <button class="chat-menu-btn" title="Clear" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:3px; font-weight:bold;">⋮</button>
                            </div>
                        </div>
                    `;
                }).join('');
                document.querySelectorAll('#recent-chats .user-item').forEach(item => {
                    item.addEventListener('click', (e) => { if (!e.target.classList.contains('chat-menu-btn')) openChat(item.getAttribute('data-username')); });
                });
                document.querySelectorAll('.chat-menu-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const targetUser = btn.closest('.user-item').getAttribute('data-username');
                        if (confirm(`Clear ENTIRE chat history with ${targetUser}?`)) {
                            const chatId = getChatId(currentUser.username, targetUser);
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
        if (!username) return;
        activeChatUser = username; noChatSelected.classList.remove('active'); activeChat.classList.add('active'); document.body.classList.add('chat-active');
        receiverUsername.textContent = username; 
        
        // Fetch recipient avatar
        const { data: prof } = await supabaseClient.from('profiles').select('avatar_url').eq('username', username).single();
        if (prof && prof.avatar_url) {
            receiverAvatar.innerHTML = `<img src="${prof.avatar_url}" style="width:100%;height:100%;border-radius:12px;object-fit:cover;">`;
        } else {
            receiverAvatar.textContent = username[0].toUpperCase();
            receiverAvatar.innerHTML = username[0].toUpperCase();
        }

        const chatId = getChatId(currentUser.username, activeChatUser);
        
        // Mark existing as read (Only if they are currently unread to prevent infinite update loop)
        await supabaseClient
            .from('messages')
            .update({ is_read: true })
            .eq('chat_id', chatId)
            .neq('sender', currentUser.username)
            .eq('is_read', false);

        // Fetch history
        const { data: msgs, error } = await supabaseClient
            .from('messages')
            .select('*')
            .eq('chat_id', chatId)
            .order('timestamp', { ascending: true });
        
        if (!error) renderMessages(msgs || []);
    }

    backToSidebar.addEventListener('click', () => { document.body.classList.remove('chat-active'); activeChatUser = null; if (activeMessageChannel) activeMessageChannel.unsubscribe(); });

    function renderMessages(messages) {
        const deletedIds = JSON.parse(localStorage.getItem('deletedMessages') || '[]');
        const visible = messages.filter(m => !deletedIds.includes(m.id));

        messageList.innerHTML = visible.map(m => {
            const ticks = m.sender === currentUser.username ? `<span class="msg-status" style="color:${m.is_read ? 'var(--neon-magenta)' : 'var(--text-secondary)'}; font-size:12px; margin-left:3px;">${m.is_read ? '✓✓' : '✓'}</span>` : '';
            const editedTag = m.is_edited ? `<span style="font-size:10px; color:var(--text-muted); font-style:italic; margin-left:4px;">(edited)</span>` : '';
            
            let parentHTML = '';
            if (m.parent_id) {
                const parent = messages.find(msg => msg.id === m.parent_id);
                if (parent) {
                    parentHTML = `<div class="message-reply-quote"><strong>${parent.sender === currentUser.username ? 'You' : parent.sender}</strong><div>${parent.text || '[Attachment]'}</div></div>`;
                }
            }

            let reactionsHTML = '';
            let reactionsCache = '[]';
            if (m.reactions && m.reactions.length > 0) {
                reactionsHTML = `<div class="reaction-container">${m.reactions.map(r => `<span class="reaction-badge ${r.users.includes(currentUser.username) ? 'active' : ''}" data-emoji="${r.emoji}">${r.emoji} ${r.users.length}</span>`).join('')}</div>`;
                reactionsCache = JSON.stringify(m.reactions);
            }

            let attachmentHTML = '';
            
            if (m.file_url) {
                if (m.file_type === 'video') {
                    attachmentHTML = `<video controls src="${m.file_url}" style="max-width:100%; border-radius:10px; margin-top:5px; max-height:250px;"></video>`;
                } else if (m.file_type === 'audio') {
                    attachmentHTML = `<audio controls src="${m.file_url}" style="width:200px; margin-top:5px; border-radius:10px;"></audio>`;
                } else if (m.file_type === 'image') {
                    attachmentHTML = `<img src="${m.file_url}" class="msg-img">`;
                } else {
                    attachmentHTML = `<a href="${m.file_url}" target="_blank" style="display:flex; align-items:center; gap:8px; padding:10px; background:rgba(255,255,255,0.1); border-radius:8px; color:white; text-decoration:none; margin-top:5px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2.5L18.5 10H13V4.5z"/></svg> Download Attachment</a>`;
                }
            } else if (m.image) {
                // Legacy Base64
                if (m.image.startsWith('data:audio/')) {
                    attachmentHTML = `<audio controls src="${m.image}" style="width:200px; margin-top:5px; border-radius:10px;"></audio>`;
                } else {
                    attachmentHTML = `<img src="${m.image}" class="msg-img">`;
                }
            }

            return `
                <div class="message ${m.sender === currentUser.username ? 'sent' : 'received'}" data-id="${m.id}" data-file-url="${m.file_url || m.image || ''}" data-reactions-cache='${reactionsCache}' style="cursor: pointer;">
                    <div class="message-bubble">
                        ${parentHTML}
                        ${attachmentHTML}
                        ${m.text ? `<div class="msg-text">${formatMessage(m.text)}</div>` : ''}
                        ${reactionsHTML}
                    </div>
                    <div style="display:flex; align-items:center; justify-content:flex-end; gap:2px;">
                        <span class="msg-time">${new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        ${ticks}
                        ${editedTag}
                    </div>
                </div>
            `;
        }).join('');
        messageList.scrollTop = messageList.scrollHeight;
    }

    // Message click for Options Menu
    messageList.addEventListener('click', (e) => {
        const msgEl = e.target.closest('.message'); if (!msgEl) return;
        selectedMsgId = msgEl.getAttribute('data-id'); if (!selectedMsgId) return;
        const msgId = selectedMsgId;
        const fileUrl = msgEl.getAttribute('data-file-url');

        msgOptionsModal.classList.add('active');
        
        if (fileUrl && fileUrl.trim() !== '') {
            downloadFileBtn.style.display = 'block';
            downloadFileBtn.onclick = () => {
                window.open(fileUrl, '_blank');
                msgOptionsModal.classList.remove('active');
            };
        } else {
            downloadFileBtn.style.display = 'none';
        }

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

        // Reply logic
        replyMsgBtn.onclick = () => {
            const text = msgEl.querySelector('.message-bubble').innerText;
            const sender = msgEl.classList.contains('sent') ? 'You' : (activeChatUser || 'User');
            replyingToMessage = { id: msgId, text: text, sender: sender };
            
            replyPreviewBar.style.display = 'flex';
            replyPreviewContent.querySelector('strong').textContent = `Replying to ${sender}`;
            replyPreviewContent.querySelector('p').textContent = text.substring(0, 50) + (text.length > 50 ? '...' : '');
            
            msgOptionsModal.classList.remove('active');
            messageInput.focus();
        };

        // Edit logic
        editMsgBtn.onclick = () => {
            if (!msgEl.classList.contains('sent')) { alert("You can only edit your own messages."); return; }
            editingMessageId = msgId;
            const textEl = msgEl.querySelector('.msg-text');
            const currentText = textEl ? textEl.innerText : "";
            messageInput.value = currentText;
            msgOptionsModal.classList.remove('active');
            messageInput.focus();
            sendBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`; // Change to checkmark
        };

        cancelOptionsBtn.onclick = () => { msgOptionsModal.classList.remove('active'); selectedMsgId = null; };
    });

    async function toggleReaction(msgId, emoji) {
        try {
            // Optimistic Update: Immediately update the UI for the user
            const msgEl = messageList.querySelector(`[data-id="${msgId}"]`);
            if (msgEl) {
                let reactionContainer = msgEl.querySelector('.reaction-container');
                if (!reactionContainer) {
                    reactionContainer = document.createElement('div');
                    reactionContainer.className = 'reaction-container';
                    msgEl.querySelector('.message-bubble').appendChild(reactionContainer);
                }
                // Simulating local update for instant feedback
                const badge = Array.from(reactionContainer.querySelectorAll('.reaction-badge')).find(b => b.getAttribute('data-emoji') === emoji);
                if (badge) {
                    badge.classList.toggle('active');
                } else {
                    reactionContainer.insertAdjacentHTML('beforeend', `<span class="reaction-badge active" data-emoji="${emoji}">${emoji} 1</span>`);
                }
            }

            const { data, error: fetchError } = await supabaseClient.from('messages').select('reactions').eq('id', msgId).single();
            if (fetchError) throw new Error("Ensure the 'reactions' column exists in your Supabase 'messages' table!");
            
            let reactions = data.reactions || [];
            if (typeof reactions === 'string') reactions = JSON.parse(reactions); // Defensive

            const existingIdx = reactions.findIndex(r => r.emoji === emoji);
            
            if (existingIdx > -1) {
                const userIdx = reactions[existingIdx].users.indexOf(currentUser.username);
                if (userIdx > -1) {
                    reactions[existingIdx].users.splice(userIdx, 1);
                    if (reactions[existingIdx].users.length === 0) reactions.splice(existingIdx, 1);
                } else {
                    reactions[existingIdx].users.push(currentUser.username);
                }
            } else {
                reactions.push({ emoji, users: [currentUser.username] });
            }
            
            
            const { error: updateError } = await supabaseClient.from('messages').update({ reactions }).eq('id', msgId);
            if (updateError) throw updateError;

            // Trigger local burst if we added a reaction
            if (existingIdx === -1 || !reactions[existingIdx]?.users.includes(currentUser.username)) {
               const msgEl = messageList.querySelector(`[data-id="${msgId}"]`);
               if (msgEl) triggerEmojiBurst(msgEl, emoji);
            }
        } catch (err) {
            console.error("Reaction failed:", err);
            alert("Reaction Error: " + err.message);
            openChat(activeChatUser); // Revert to server state
        }
    }

    cancelReplyBtn.onclick = () => {
        replyingToMessage = null;
        replyPreviewBar.style.display = 'none';
    };

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
    let selectedFileObj = null;

    async function sendMsg() {
        const text = messageInput.value.trim(); 
        if (!text && !selectedImageBase64 && !selectedFileObj) return;

        if (editingMessageId) {
            try {
                const { error } = await supabaseClient.from('messages').update({ 
                    text: text, 
                    is_edited: true, 
                    last_edited_at: new Date().toISOString() 
                }).eq('id', editingMessageId);
                
                if (error) throw error;

                editingMessageId = null;
                messageInput.value = '';
                sendBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`;
                openChat(activeChatUser);
                return;
            } catch (err) {
                alert("Failed to update message: " + err.message);
                return;
            }
        }

        const chatId = getChatId(currentUser.username, activeChatUser);
        
        let fileUrl = null;
        let fileType = null;
        
        // Local Optimistic Append
        const tempId = 'temp_' + Date.now();
        const optimisticMsg = {
            id: tempId,
            chat_id: chatId,
            sender: currentUser.username,
            text: text || null,
            timestamp: new Date().toISOString(),
            is_read: false,
            parent_id: replyingToMessage ? replyingToMessage.id : null,
            status: 'sending' 
        };
        appendSingleMessage(optimisticMsg);

        if (selectedFileObj) {
            const ext = selectedFileObj.name.split('.').pop();
            const filePath = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
            try {
                const { data, error } = await supabaseClient.storage.from('chat-attachments').upload(filePath, selectedFileObj);
                if (!error) {
                    const { data: { publicUrl } } = supabaseClient.storage.from('chat-attachments').getPublicUrl(filePath);
                    fileUrl = publicUrl;
                    if (selectedFileObj.type.startsWith('video/')) fileType = 'video';
                    else if (selectedFileObj.type.startsWith('image/')) fileType = 'image';
                    else if (selectedFileObj.type.startsWith('audio/')) fileType = 'audio';
                    else fileType = 'document';
                    selectedImageBase64 = null;
                }
            } catch(e) { console.error(e) }
        }

        const { error: insertErr } = await supabaseClient.from('messages').insert([{ 
            chat_id: chatId, 
            sender: currentUser.username, 
            text: text || null, 
            image: selectedImageBase64 || null,
            file_url: fileUrl,
            file_type: fileType,
            parent_id: replyingToMessage ? replyingToMessage.id : null
        }]);

        if (insertErr) {
            alert("Message failed to send: " + insertErr.message);
            const tempEl = document.querySelector(`[data-id="${tempId}"]`);
            if (tempEl) tempEl.style.opacity = '0.5';
        } else {
            const tempEl = document.querySelector(`[data-id="${tempId}"]`);
            if (tempEl) tempEl.remove(); // Realtime listener will append the real one
        }

        messageInput.value = ''; 
        clearImagePreview(); 
        loadRecentChats();
        
        if (replyingToMessage) {
            replyingToMessage = null;
            replyPreviewBar.style.display = 'none';
        }
    }

    sendBtn.addEventListener('click', sendMsg);
    messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMsg(); });
    messageInput.addEventListener('input', () => {
        if (activeChatUser) {
            supabaseClient.channel(`calls_${activeChatUser}`).send({
                type: 'broadcast',
                event: 'typing',
                payload: { typer: currentUser.username }
            });
        }
    });

    const syncChatBtn = document.getElementById('sync-chat-btn');
    if (syncChatBtn) {
        syncChatBtn.addEventListener('click', () => {
            if (activeChatUser) {
                syncChatBtn.style.transform = 'rotate(360deg)';
                syncChatBtn.style.transition = 'transform 0.5s ease';
                setTimeout(() => { syncChatBtn.style.transform = 'rotate(0deg)'; }, 500);
                openChat(activeChatUser);
            }
        });
    }

    const voiceNoteBtn = document.getElementById('voice-note-btn');
    const voiceRecDot = document.getElementById('voice-rec-dot');
    let voiceRecorder = null;
    let voiceChunks = [];

    if (voiceNoteBtn) {
        voiceNoteBtn.addEventListener('mousedown', async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                voiceRecorder = new MediaRecorder(stream);
                voiceChunks = [];
                
                voiceRecorder.ondataavailable = (e) => { if (e.data.size > 0) voiceChunks.push(e.data); };
                voiceRecorder.onstop = async () => {
                    const audioBlob = new Blob(voiceChunks, { type: 'audio/webm' });
                    // Provide as simulated file
                    selectedFileObj = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
                    
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                        selectedImageBase64 = reader.result; // Fallback
                        sendMsg(); 
                    };
                    reader.readAsDataURL(audioBlob);
                    stream.getTracks().forEach(t => t.stop());
                };
                voiceRecorder.start();
                if (voiceRecDot) voiceRecDot.style.display = 'block';
            } catch (err) { console.log(err); }
        });

        voiceNoteBtn.addEventListener('mouseup', () => {
            if (voiceRecorder && voiceRecorder.state === 'recording') {
                voiceRecorder.stop();
                if (voiceRecDot) voiceRecDot.style.display = 'none';
            }
        });

        voiceNoteBtn.addEventListener('touchstart', (e) => { e.preventDefault(); voiceNoteBtn.dispatchEvent(new Event('mousedown')); });
        voiceNoteBtn.addEventListener('touchend', (e) => { e.preventDefault(); voiceNoteBtn.dispatchEvent(new Event('mouseup')); });
    }

    imageUpload.addEventListener('change', (e) => { 
        const file = e.target.files[0]; 
        if (file) { 
            selectedFileObj = file;
            if (file.type.startsWith('image/')) {
                const reader = new FileReader(); 
                reader.onload = (event) => { selectedImageBase64 = event.target.result; previewImg.src = event.target.result; imagePreview.classList.remove('preview-hidden'); }; 
                reader.readAsDataURL(file); 
            } else {
                // Show generic file icon
                previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23ff007a" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2.5L18.5 10H13V4.5z"/></svg>';
                imagePreview.classList.remove('preview-hidden');
            }
        } 
    });
    
    function clearImagePreview() { selectedFileObj = null; selectedImageBase64 = null; imagePreview.classList.add('preview-hidden'); previewImg.src = ''; imageUpload.value = ''; }
    clearPreview.addEventListener('click', clearImagePreview);


    // Profile Avatar Upload
    const avatarUpload = document.getElementById('avatar-upload');
    if (avatarUpload) {
        avatarUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const ext = file.name.split('.').pop();
            const filePath = `avatar_${currentUser.username}_${Date.now()}.${ext}`;
            try {
                currentAvatar.textContent = '...';
                const { data, error } = await supabaseClient.storage.from('user-avatars').upload(filePath, file);
                if (error) throw new Error(error.message + " (Do you have the 'user-avatars' bucket created?)");

                const { data: { publicUrl } } = supabaseClient.storage.from('user-avatars').getPublicUrl(filePath);
                await supabaseClient.from('profiles').update({ avatar_url: publicUrl }).eq('username', currentUser.username);
                
                currentUser.avatar_url = publicUrl;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                currentAvatar.innerHTML = `<img src="${publicUrl}" style="width:100%;height:100%;border-radius:12px;object-fit:cover;">`;
                alert('Profile photo updated successfully!');
            } catch (err) {
                alert("Avatar upload failed: " + err.message);
                currentAvatar.textContent = currentUser.username[0].toUpperCase();
            }
        });

        // Trigger upload when clicking avatar
        currentAvatar.addEventListener('click', () => {
            avatarUpload.click();
        });
    }

    // --- 6. WebRTC Call Logic (via Supabase Realtime Broadcast) ---
    let typingTimeout; // global scoped near state

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
            .on('broadcast', { event: 'typing' }, payload => {
                const { typer } = payload.payload;
                if (typer === activeChatUser) {
                    const statusEl = document.querySelector('.receiver-status');
                    if (statusEl) {
                        statusEl.textContent = 'typing...';
                        statusEl.style.color = 'var(--neon-magenta)';
                        clearTimeout(typingTimeout);
                        typingTimeout = setTimeout(() => {
                            statusEl.textContent = 'Active now';
                            statusEl.style.color = 'var(--cyan-neon)';
                        }, 2000);
                    }
                }
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
        const div = document.createElement('div'); 
        div.className = `message ${m.sender === currentUser.username ? 'sent' : 'received'}`; 
        div.setAttribute('data-id', m.id); 
        div.setAttribute('data-file-url', m.file_url || m.image || '');
        div.style.cursor = 'pointer';
        
        const ticks = m.sender === currentUser.username ? `<span class="msg-status" style="color:${m.is_read ? 'var(--neon-magenta)' : 'var(--text-secondary)'}; font-size:12px; margin-left:3px;">${m.is_read ? '✓✓' : '✓'}</span>` : '';
        const editedTag = m.is_edited ? `<span class="edited-tag" style="font-size:10px; color:var(--text-muted); font-style:italic; margin-left:4px;">(edited)</span>` : '';

        let parentHTML = '';
        if (m.parent_id) {
            // We might not have all messages in memory, so we could show a placeholder or fetch.
            // For now, let's just show "Replying to..."
            parentHTML = `<div class="message-reply-quote"><strong>Replying...</strong></div>`;
        }

        let reactionsHTML = '';
        if (m.reactions && m.reactions.length > 0) {
            reactionsHTML = `<div class="reaction-container">${m.reactions.map(r => `<span class="reaction-badge ${r.users.includes(currentUser.username) ? 'active' : ''}" data-emoji="${r.emoji}">${r.emoji} ${r.users.length}</span>`).join('')}</div>`;
        }

        let attachmentHTML = '';
        if (m.file_url) {
            if (m.file_type === 'video') {
                attachmentHTML = `<video controls src="${m.file_url}" style="max-width:100%; border-radius:10px; margin-top:5px; max-height:250px;"></video>`;
            } else if (m.file_type === 'audio') {
                attachmentHTML = `<audio controls src="${m.file_url}" style="width:200px; margin-top:5px; border-radius:10px;"></audio>`;
            } else if (m.file_type === 'image') {
                attachmentHTML = `<img src="${m.file_url}" class="msg-img">`;
            } else {
                attachmentHTML = `<a href="${m.file_url}" target="_blank" style="display:flex; align-items:center; gap:8px; padding:10px; background:rgba(255,255,255,0.1); border-radius:8px; color:white; text-decoration:none; margin-top:5px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2.5L18.5 10H13V4.5z"/></svg> Download Attachment</a>`;
            }
        } else if (m.image) {
            if (m.image.startsWith('data:audio/')) {
                attachmentHTML = `<audio controls src="${m.image}" style="width:200px; margin-top:5px; border-radius:10px;"></audio>`;
            } else {
                attachmentHTML = `<img src="${m.image}" class="msg-img">`;
            }
        }

        div.innerHTML = `<div class="message-bubble">${parentHTML}${attachmentHTML}${m.text ? `<div class="msg-text">${formatMessage(m.text)}</div>` : ''}${reactionsHTML}</div><div style="display:flex; align-items:center; justify-content:flex-end; gap:2px;"><span class="msg-time">${new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>${ticks}${editedTag}</div>`;
        messageList.appendChild(div); const img = div.querySelector('.msg-img');
        if (img) img.onload = () => { messageList.scrollTop = messageList.scrollHeight; }; else messageList.scrollTop = messageList.scrollHeight;
    }

    init();
});
