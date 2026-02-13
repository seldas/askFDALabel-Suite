const { spawn } = require('child_process');
const path = require('path');
const config = require('../../suite.config.js');

const port = process.env.PORT || config.frontend.port;
const host = process.env.HOST || config.frontend.host;

console.log(`> Starting Next.js on http://${host}:${port}`);

const nextProcess = spawn('npx', ['next', 'dev', '-p', port, '-H', host], {
  stdio: 'inherit',
  shell: true
});

nextProcess.on('error', (err) => {
  console.error('Failed to start frontend:', err);
});
