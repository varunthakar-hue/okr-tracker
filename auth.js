// Run this once to authenticate: node src/auth.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CREDENTIALS_PATH = path.join(__dirname, '../google-credentials.json');
const TOKEN_PATH = path.join(__dirname, '../google-token.json');
const SCOPES = ['https://www.googleapis.com/auth/drive'];

async function main() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error([
      '',
      '❌  google-credentials.json not found.',
      '',
      'Steps to get it:',
      '1. Go to console.cloud.google.com',
      '2. Select your project (analog-arbor-501906-t6)',
      '3. APIs & Services → Credentials',
      '4. + Create Credentials → OAuth client ID',
      '5. Application type: Desktop app → name it anything → Create',
      '6. Download the JSON → rename to google-credentials.json',
      '7. Move it to: ' + CREDENTIALS_PATH,
      '8. Run this script again: node src/auth.js',
      '',
    ].join('\n'));
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3099');

  const authUrl = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });

  console.log('\n🔐 Opening browser for Google auth...\n');
  console.log('If browser does not open, visit this URL:\n' + authUrl + '\n');

  // Try to open browser
  const { exec } = require('child_process');
  exec(`open "${authUrl}"`);

  // Local server to catch the redirect
  await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost:3099');
      const code = url.searchParams.get('code');
      if (!code) { res.end('No code received.'); return; }

      res.end('<h2>✅ Authenticated! You can close this tab and return to the terminal.</h2>');
      server.close();

      try {
        const { tokens } = await auth.getToken(code);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
        console.log('✅ Token saved to google-token.json');
        console.log('✅ Google Drive auth complete — you\'re ready to go!\n');
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    server.listen(3099, () => console.log('Waiting for Google auth callback on port 3099...'));
    server.on('error', reject);
  });
}

main().catch(err => { console.error('Auth failed:', err.message); process.exit(1); });
