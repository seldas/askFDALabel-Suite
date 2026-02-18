const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 1. Load .env from project root
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

// 2. Load suite config as fallback
const config = require('../../suite.config.js');

// 3. Resolve host and port
const host = process.env.HOST || config.backend.host || '0.0.0.0';
const port = process.env.BACKEND_PORT || config.backend.port || 8842;
const isProd = process.env.NODE_ENV === 'production';

const backendPath = path.resolve(__dirname, '../../backend/app.py');

let cmd, args;

if (isProd) {
  // Use Waitress for production on Windows (or Gunicorn if user preferred Linux)
  console.log(`> Starting backend in PRODUCTION on http://${host}:${port} using waitress`);
  // Assuming the Flask app instance is named 'app' in 'app.py'
  cmd = 'waitress-serve';
  args = [`--host=${host}`, `--port=${port}`, 'app:app'];
} else {
  console.log(`> Starting backend in DEVELOPMENT on http://${host}:${port}`);
  cmd = 'python';
  args = [backendPath];
}

const pythonProcess = spawn(cmd, args, {
  stdio: 'inherit',
  shell: true,
  cwd: path.resolve(__dirname, '../../backend'), // Run from backend directory
  env: {
    ...process.env,
    PORT: String(port),
    HOST: String(host),
  },
});

pythonProcess.on('error', (err) => {
  console.error('Failed to start backend:', err);
});

pythonProcess.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.log(`Backend process exited with code ${code}`);
  }
});
