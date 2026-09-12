const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 10000;

// In-memory multiplayer state for the first deployment.
// It is intentionally simple so it works on Render's free web service.
const players = new Map();
const leagues = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'worldsoccer-multiplayer' }));
app.get('/api/status', (_req, res) => res.json({
  players: players.size,
  leagues: [...leagues.values()].map(l => ({ id: l.id, name: l.name, members: l.members.length }))
}));

io.on('connection', (socket) => {
  socket.emit('server:ready', { id: socket.id });

  socket.on('player:join', ({ name }) => {
    const clean = String(name || '').trim().slice(0, 24);
    if (!clean) return socket.emit('error:message', 'Nama diperlukan.');
    players.set(socket.id, { id: socket.id, name: clean, team: 'New Club', budget: 100000000 });
    socket.emit('player:joined', players.get(socket.id));
    io.emit('lobby:players', [...players.values()]);
  });

  socket.on('league:create', ({ name }) => {
    const player = players.get(socket.id);
    if (!player) return socket.emit('error:message', 'Sertai sebagai pemain dahulu.');
    const clean = String(name || '').trim().slice(0, 40) || `${player.name}'s League`;
    const id = `league_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const league = { id, name: clean, owner: socket.id, members: [socket.id] };
    leagues.set(id, league);
    socket.join(id);
    io.to(id).emit('league:update', league);
  });

  socket.on('league:join', ({ id }) => {
    const player = players.get(socket.id);
    const league = leagues.get(String(id || ''));
    if (!player) return socket.emit('error:message', 'Sertai sebagai pemain dahulu.');
    if (!league) return socket.emit('error:message', 'Liga tidak ditemui.');
    if (!league.members.includes(socket.id)) league.members.push(socket.id);
    socket.join(league.id);
    io.to(league.id).emit('league:update', league);
  });

  socket.on('chat:send', ({ message }) => {
    const player = players.get(socket.id);
    const text = String(message || '').trim().slice(0, 300);
    if (!player || !text) return;
    io.emit('chat:message', { name: player.name, message: text, at: Date.now() });
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    for (const league of leagues.values()) {
      league.members = league.members.filter(id => id !== socket.id);
      if (league.owner === socket.id && league.members.length) league.owner = league.members[0];
    }
    io.emit('lobby:players', [...players.values()]);
  });
});

server.listen(PORT, () => console.log(`World Soccer Manager multiplayer server listening on ${PORT}`));
