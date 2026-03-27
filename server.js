const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ['polling', 'websocket']
});

app.use(express.static('public'));

// File where messages are stored
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Load existing messages or start fresh
let messages = {};
try {
  const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
  messages = JSON.parse(data);
  console.log('📁 Loaded existing messages');
} catch (err) {
  console.log('📁 No existing messages file, starting fresh');
  messages = {};
}

// Helper to save messages to disk
function saveMessages() {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

// Store online users
const onlineUsers = new Map();
const nameToSocket = new Map();

io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  socket.on('user-join', (data) => {
    const { name, email } = data;
    onlineUsers.set(socket.id, { name, email });
    nameToSocket.set(name, socket.id);
    
    const userList = Array.from(onlineUsers.values()).map(u => u.name);
    io.emit('user-list', userList);
    
    socket.emit('receive-message', {
      user: 'System',
      text: `Welcome ${name}! 👋`,
      timestamp: Date.now(),
      room: 'System'
    });
    socket.broadcast.emit('receive-message', {
      user: 'System',
      text: `${name} joined the chat!`,
      timestamp: Date.now(),
      room: 'System'
    });
    console.log(`👤 ${name} joined`);
  });

  socket.on('join-room', (data) => {
    socket.join(data.room);
    console.log(`${onlineUsers.get(socket.id)?.name} joined room: ${data.room}`);
    
    // Send message history for this room
    const roomMessages = messages[data.room] || [];
    socket.emit('message-history', {
      room: data.room,
      messages: roomMessages
    });
  });

  socket.on('send-message', (data) => {
    const { room, user, text } = data;
    const newMsg = {
      id: Date.now(),
      user: user,
      text: text,
      timestamp: Date.now()
    };
    
    // Store in memory and save to file
    if (!messages[room]) messages[room] = [];
    messages[room].push(newMsg);
    saveMessages();
    
    // Broadcast to everyone in the room
    io.to(room).emit('receive-message', {
      user: user,
      text: text,
      timestamp: newMsg.timestamp,
      room: room
    });
  });

  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      onlineUsers.delete(socket.id);
      nameToSocket.delete(user.name);
      const userList = Array.from(onlineUsers.values()).map(u => u.name);
      io.emit('user-list', userList);
      
      io.emit('receive-message', {
        user: 'System',
        text: `${user.name} left the chat`,
        timestamp: Date.now(),
        room: 'System'
      });
      console.log(`👋 ${user.name} left`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📡 Socket.IO ready for real-time chat!`);
});
