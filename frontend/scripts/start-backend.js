const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../../suite.config.js');

function parseDotEnv(contents) {
  const out = {};
  const lines = contents.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();

    // strip surrounding quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    out[key] = val;
  }
  return out;
}

// 1) Read ../../.env first (but don't override already-set shell env vars)
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  try {
    const parsed = parseDotEnv(fs.readFileSync(envPath, 'utf8'));

    // accept either HOST / host, BACKEND_PORT / backend_port
    const hostFromFile = parsed.HOST ?? parsed.host;
    const portFromFile = parsed.BACKEND_PORT ?? parsed.backend_port;

    if (hostFromFile && !process.env.HOST) process.env.HOST = hostFromFile;
    if (portFromFile && !process.env.BACKEND_PORT) process.env.BACKEND_PORT = portFromFile;
  } catch (e) {
    console.warn(`Warning: failed to read ${envPath}:`, e);
  }
} else {
  console.warn(`Warning: .env not found at ${envPath} (falling back to suite.config.js)`);
}

// 2) Fallback to suite.config.js if still missing
const backendPath = path.resolve(__dirname, '../../backend/app.py');
const port = process.env.BACKEND_PORT || config.backend.port;
const host = process.env.HOST || config.backend.host;

console.log(`Starting backend from: ${backendPath} on http://${host}:${port}`);

const pythonProcess = spawn('python', [backendPath], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    // keep these for the Python app if it expects them
    PORT: String(port),
    HOST: String(host),
  },
});

pythonProcess.on('error', (err) => {
  console.error('Failed to start backend:', err);
});

pythonProcess.on('close', (code) => {
  console.log(`Backend process exited with code ${code}`);
});
