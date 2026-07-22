require('dotenv').config();
const express = require('express');
const path = require('path');
const { collectReplies } = require('./collect');
const { sendCheckins } = require('./send');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

app.get('/api/status', (req, res) => {
  try {
    const data = require('fs').readFileSync(path.join(__dirname, '../data/checkins.json'), 'utf8');
    res.json(JSON.parse(data));
  } catch {
    res.json({});
  }
});

app.post('/api/collect', async (req, res) => {
  try {
    const data = await collectReplies();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/send', (req, res) => {
  const ip = req.socket.remoteAddress;
  if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
    return res.status(403).json({ error: 'Forbidden — localhost only' });
  }
  sendCheckins()
    .then(() => res.json({ ok: true }))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.listen(PORT, () => {
  console.log(`🚀 Dashboard running at http://localhost:${PORT}`);
});
