const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['polling', 'websocket']
});

app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection (replace with your connection string!)
const MONGODB_URI = 'mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster.mongodb.net/bmc-study-buddy?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  grade: { type: String, default: '11th Grade' },
  classes: { type: [String], default: [] },
  friends: { type: [String], default: [] },
  avatar: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Message Schema
const messageSchema = new mongoose.Schema({
  room: String,
  user: String,
  text: String,
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// Store online users
const onlineUsers = new Map();
const nameToSocket = new Map();

// API Routes for Auth
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, grade, classes } = req.body;
    
    // Check if email ends with @bmcchs.org
    if (!email.endsWith('@bmcchs.org')) {
      return res.status(400).json({ error: 'Must use @bmcchs.org email' });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const user = new User({
      name,
      email,
      password: hashedPassword,
      grade,
      classes: classes || []
    });
    
    await user.save();
    
    res.json({ success: true, user: { name: user.name, email: user.email, grade: user.grade, classes: user.classes } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid password' });
    }
    
    res.json({ success: true, user: { name: user.name, email: user.email, grade: user.grade, classes: user.classes, friends: user.friends } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'name email grade');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/add-friend', async (req, res) => {
  try {
    const { userEmail, friendName } = req.body;
    const user = await User.findOne({ email: userEmail });
    const friend = await User.findOne({ name: friendName });
    
    if (!user || !friend) {
      return res.status(400).json({ error: 'User not found' });
    }
    
    if (!user.friends.includes(friendName)) {
      user.friends.push(friendName);
      await user.save();
    }
    
    res.json({ success: true, friends: user.friends });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add friend' });
  }
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('user-join', async (data) => {
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
    
    console.log(`${name} joined`);
  });

  socket.on('join-room', (data) => {
    socket.join(data.room);
    console.log(`${onlineUsers.get(socket.id)?.name} joined ${data.room}`);
  });

  socket.on('send-message', async (data) => {
    try {
      const message = new Message({
        room: data.room,
        user: data.user,
        text: data.text,
        timestamp: new Date()
      });
      await message.save();
      
      io.to(data.room).emit('receive-message', {
        user: data.user,
        text: data.text,
        timestamp: Date.now(),
        room: data.room
      });
    } catch (error) {
      console.error('Error saving message:', error);
    }
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
      console.log(`${user.name} left`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📡 Socket.IO ready for real-time chat!`);
});
