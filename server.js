const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = 8400;
const DB_FILE = path.join(__dirname, 'db.json');

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(__dirname)); // Serve static files from root

// --- Database Helpers ---
function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initial = { users: [], messages: {} };
        fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
        return initial;
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Ensure database file exists upon boot
loadDB();

// --- REST API Endpoints ---

// Register
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    const db = loadDB();
    if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        return res.status(400).json({ error: 'Username already exists!' });
    }

    const newUser = { username, password, createdAt: new Date().toISOString() };
    db.users.push(newUser);
    saveDB(db);

    res.status(201).json(newUser);
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = loadDB();
    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

    if (user) {
        res.status(200).json(user);
    } else {
        res.status(401).json({ error: 'Invalid credentials.' });
    }
});

// Get Users (for search)
app.get('/api/users', (req, res) => {
    const db = loadDB();
    // Return sanitized users (no passwords)
    const sanitized = db.users.map(u => ({ username: u.username }));
    res.status(200).json(sanitized);
});

// Get Chat History
app.get('/api/messages/:chatId', (req, res) => {
    const { chatId } = req.params;
    const db = loadDB();
    res.status(200).json(db.messages[chatId] || []);
});

// Get Recent Chats for a user
app.get('/api/recent-chats/:username', (req, res) => {
    const { username } = req.params;
    const db = loadDB();
    const recents = [];

    for (const chatId in db.messages) {
        if (chatId.includes(username)) {
            const parts = chatId.split('_');
            const otherUser = parts.find(p => p.toLowerCase() !== username.toLowerCase());
            const messages = db.messages[chatId];
            if (otherUser && messages.length > 0) {
                const lastMsg = messages[messages.length - 1];
                recents.push({
                    username: otherUser,
                    lastMessage: lastMsg.text || (lastMsg.image ? '[Image]' : ''),
                    timestamp: lastMsg.timestamp
                });
            }
        }
    }
    recents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.status(200).json(recents);
});

// --- Socket.IO Realtime Logic ---
const activeUsers = {}; // socket.id -> username

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Identify user
    socket.on('register_socket', (username) => {
        activeUsers[socket.id] = username;
        socket.join(username); // Join self-named room for target broadcasts
        console.log(`${username} active on socket ${socket.id}`);
    });

    // Join Group Chat Room
    socket.on('join_chat', (chatId) => {
        socket.join(chatId);
    });

    // Handle New Message
    socket.on('send_message', (data) => {
        const { chatId, message } = data;
        const db = loadDB();
        
        if (!db.messages[chatId]) {
            db.messages[chatId] = [];
        }
        
        db.messages[chatId].push(message);
        saveDB(db);

        // Broadcast to both users in the room
        io.to(chatId).emit('receive_message', { chatId, message });
    });

    socket.on('initiate_call', (data) => {
        const { caller, receiver } = data;
        console.log(`[CALL] ${caller} is calling ${receiver}`);
        // Send call signal directly to target user's personal room
        io.to(receiver).emit('incoming_call_signal', { caller, status: 'ringing' });
    });

    // Generalized WebRTC Signal Carrier
    socket.on('webrtc_signal', (data) => {
        const { target, signal } = data;
        console.log(`[WEBRTC] Signal from ${activeUsers[socket.id]} to ${target}`);
        io.to(target).emit('webrtc_signal_received', { signal, sender: activeUsers[socket.id] });
    });

    // Handle Call Response
    socket.on('respond_call', (data) => {
        const { caller, receiver, status } = data;
        io.to(caller).emit('call_status_update', { caller, receiver, status });
    });

    // Handle Delete Message
    socket.on('delete_message', (data) => {
        const { chatId, messageId } = data;
        const db = loadDB();
        if (db.messages[chatId]) {
            db.messages[chatId] = db.messages[chatId].filter(m => m.id !== messageId);
            saveDB(db);
        }
        io.to(chatId).emit('message_deleted', { messageId });
    });

    // Handle Delete Whole Chat
    socket.on('delete_chat', (data) => {
        const { chatId } = data;
        const db = loadDB();
        if (db.messages[chatId]) {
            db.messages[chatId] = []; // Clear
            saveDB(db);
        }
        io.to(chatId).emit('chat_cleared', { chatId });
    });

    socket.on('hangup_call', (data) => {
        const { target } = data;
        io.to(target).emit('call_terminated');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete activeUsers[socket.id];
    });
});

// Fallback to index.html for unknown routes
// app.get('*', (req, res) => {
//     res.sendFile(path.join(__dirname, 'index.html'));
// });

server.listen(PORT, () => {
    console.log(`Server executing safely on http://localhost:${PORT}`);
});
