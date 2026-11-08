const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.trim().startsWith('"') && value.trim().endsWith('"')) {
      value = value.trim().substring(1, value.trim().length - 1);
    }
    env[key] = value.trim();
  }
});

// We need the refreshToken or static token
// Wait, the .env has VITE_GOOGLE_REFRESH_TOKEN and GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
const folderId = env['VITE_DRIME_RESUME_FOLDER_ID'] || env['VITE_DRIVE_RESUME_FOLDER_ID'] || '';
const clientId = env['VITE_GOOGLE_CLIENT_ID'] || '';
const clientSecret = env['VITE_GOOGLE_CLIENT_SECRET'] || '';
const refreshToken = env['VITE_GOOGLE_REFRESH_TOKEN'] || '';

async function getAccessToken() {
  console.log('Refreshing Google access token...');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to refresh token: ${res.statusText} - ${text}`);
  }
  
  const data = await res.json();
  return data.access_token;
}

async function testDrive() {
  try {
    const token = await getAccessToken();
    console.log('Access token acquired. Listing files in folder:', folderId);
    
    const q = encodeURIComponent(
      `'${folderId}' in parents and trashed = false`
    );
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size)&orderBy=createdTime desc&pageSize=100`;
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error(`Drive API list failed: ${res.status} ${res.statusText} - ${text}`);
      return;
    }
    
    const body = await res.json();
    const files = body.files ?? [];
    console.log(`Total files found in folder: ${files.length}`);
    files.forEach(f => {
      console.log(`- [${f.mimeType}] ${f.name} (ID: ${f.id}, Size: ${f.size || 'unknown'})`);
    });
    
    if (files.length > 0) {
      const firstFile = files[0];
      console.log(`Testing download for first file: ${firstFile.name}...`);
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${firstFile.id}?alt=media`;
      const dlRes = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!dlRes.ok) {
        console.error(`Download failed: ${dlRes.status} ${dlRes.statusText}`);
      } else {
        const blob = await dlRes.blob();
        console.log(`Download succeeded! Blob size: ${blob.size} bytes`);
      }
    }
  } catch (err) {
    console.error('Test failed:', err);
  }
}

testDrive();
