const { spawn } = require('child_process');
const path = require('path');
const config = require('../../suite.config.js');

const backendPath = path.resolve(__dirname, '../../backend/app.py');
const port = process.env.PORT || config.backend.port;
const host = process.env.HOST || config.backend.host;

console.log(`Starting backend from: ${backendPath} on http://${host}:${port}`);

const pythonProcess = spawn('python', [backendPath], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT: port, HOST: host }
});

pythonProcess.on('error', (err) => {
  console.error('Failed to start backend:', err);
});

pythonProcess.on('close', (code) => {
  console.log(`Backend process exited with code ${code}`);
});
