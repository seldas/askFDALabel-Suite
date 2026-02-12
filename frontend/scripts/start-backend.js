const { spawn } = require('child_process');
const path = require('path');

const backendPath = path.resolve(__dirname, '../../backend/app.py');
console.log(`Starting backend from: ${backendPath}`);

const pythonProcess = spawn('python', [backendPath], {
  stdio: 'inherit',
  shell: true
});

pythonProcess.on('error', (err) => {
  console.error('Failed to start backend:', err);
});

pythonProcess.on('close', (code) => {
  console.log(`Backend process exited with code ${code}`);
});
