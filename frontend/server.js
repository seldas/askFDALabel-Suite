const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const config = require('../suite.config.js');

const port = process.env.PORT ? Number(process.env.PORT) : config.frontend.port;
const host = process.env.HOST || config.frontend.host;

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const httpsOptions = {
  key: fs.readFileSync('../key.pem'),
  cert: fs.readFileSync('../cert.pem'),
};

app.prepare().then(() => {
  createServer(httpsOptions, (req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, host, (err) => {
    if (err) throw err;
    console.log(`> Server listening on https://${host}:${port} (dev=${dev})`);
  });
});
