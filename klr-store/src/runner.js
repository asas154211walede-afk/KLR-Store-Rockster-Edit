// Single-service launcher for low-cost hosts: web + Discord bot share one persistent volume/database.
const { fork } = require('node:child_process');
const path = require('node:path');

const children = new Map();
let shuttingDown = false;

function start(name, file, restart = false) {
  const child = fork(path.join(__dirname, file), [], { stdio: 'inherit', env: process.env });
  children.set(name, child);
  child.on('exit', (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;
    if (name === 'web') {
      console.error(`[runner] web process stopped (${code ?? signal}); stopping service`);
      shutdown(code || 1);
      return;
    }
    console.error(`[runner] Discord bot stopped (${code ?? signal})`);
    if (restart && process.env.DISCORD_TOKEN) {
      setTimeout(() => {
        if (!shuttingDown && !children.has('bot')) start('bot', 'bot.js', true);
      }, 5000);
    }
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1500).unref();
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

start('web', 'server.js');
if (process.env.DISCORD_TOKEN) {
  start('bot', 'bot.js', true);
} else {
  console.warn('[runner] DISCORD_TOKEN is empty; website will run without the Discord bot.');
}
