'use strict';

require('dotenv').config();
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const crypto = require('node:crypto');
const { loadConfig } = require('../src/config/env');
const { hashPassword, isValidPassword, isValidUsername, normalizeUsername } = require('../src/adminAuth');

function readHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Run this command in an interactive terminal so passwords are not echoed.'));
  }
  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    const finish = (result, error) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(result);
    };
    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') return finish('', new Error('Cancelled.'));
        if (character === '\r' || character === '\n') return finish(value);
        if (character === '\u0008' || character === '\u007f') {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= ' ') value += character;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const config = loadConfig();
  process.env.DATABASE_PATH = config.databasePath;
  const db = require('../src/db');
  const terminal = readline.createInterface({ input: stdin, output: stdout });
  try {
    const ownerCount = db.prepare("SELECT COUNT(*) AS count FROM admin_users WHERE role = 'owner' AND is_active = 1").get().count;
    if (ownerCount > 0) throw new Error('An active owner already exists. Create additional accounts from the Authentication page.');

    const username = normalizeUsername(await terminal.question('Owner username: '));
    if (!isValidUsername(username)) {
      throw new Error('Use 3–32 lowercase letters, numbers, periods, underscores, or hyphens for the username.');
    }
    terminal.close();

    const password = await readHidden('Owner password (12–128 characters): ');
    const confirmation = await readHidden('Confirm password: ');
    if (!isValidPassword(password)) throw new Error('Password must be 12–128 characters.');
    if (password !== confirmation) throw new Error('Passwords do not match.');

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO admin_users (id, username, password_hash, role, created_at, updated_at)
      VALUES (?, ?, ?, 'owner', ?, ?)
    `).run(crypto.randomUUID(), username, await hashPassword(password), now, now);
    stdout.write(`Created owner account "${username}". Sign in to enroll an authenticator app before continuing.\n`);
  } finally {
    if (!terminal.closed) terminal.close();
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
