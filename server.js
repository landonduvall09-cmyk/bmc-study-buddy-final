const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['polling', 'websocket']
});

app.use(express.static('public'));

const users = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('user-join', (data) => {
    const { name } = data;
    users.set(socket.id, { name });
    
    const userList = Array.from(users.values()).map(u => u.name);
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
    
    console.log(`${name} joined`);
  });

  socket.on('join-room', (data) => {
    socket.join(data.room);
    console.log(`${users.get(socket.id)?.name} joined ${data.room}`);
  });

  socket.on('send-message', (data) => {
    io.to(data.room).emit('receive-message', {
      user: data.user,
      text: data.text,
      timestamp: Date.now(),
      room: data.room
    });
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      const userList = Array.from(users.values()).map(u => u.name);
      io.emit('user-list', userList);
      
      io.emit('receive-message', {
        user: 'System',
        text: `${user.name} left the chat`,
        timestamp: Date.now(),
        room: 'System'
      });
      console.log(`${user.name} left`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📡 Socket.IO ready for real-time chat!`);
});
