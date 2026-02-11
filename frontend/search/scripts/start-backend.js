const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const isWindows = os.platform() === 'win32';
const backendDir = path.join(__dirname, '..', '..', 'backend');

let pythonPath;
let command;
let args;

if (isWindows) {
  pythonPath = path.join(backendDir, 'venv', 'Scripts', 'python.exe');
} else {
  pythonPath = path.join(backendDir, 'venv', 'bin', 'python');
}

const appPath = 'app.py';

console.log(`Starting backend from: ${backendDir}`);
console.log(`Using Python interpreter: ${pythonPath}`);

const child = spawn(pythonPath, [appPath], {
  cwd: backendDir,
  stdio: 'inherit',
  shell: true
});

child.on('error', (err) => {
  console.error('Failed to start backend process:', err);
});

child.on('exit', (code, signal) => {
  if (code) console.log(`Backend process exited with code ${code}`);
  if (signal) console.log(`Backend process killed with signal ${signal}`);
});
