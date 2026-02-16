const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

process.env.GATE_SHARED_SECRET = 'test-secret';
process.env.INTERNAL_API_TOKEN = 'internal-token';

const { createSession, redeemSession, getSession } = require('../src/db');
const { config } = require('../src/config');

function resetDb() {
  if (fs.existsSync(config.dataFilePath)) {
    fs.unlinkSync(config.dataFilePath);
  }
}

test.beforeEach(() => {
  resetDb();
});

test.after(() => {
  resetDb();
});

test('creates and redeems a key until usage limit', () => {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const key = createSession({
    externalUserId: 'user-1',
    metadata: {},
    expiresAt,
    maxUses: 1
  });

  const session = getSession(key);
  assert.equal(session.uses, 0);

  redeemSession({ sessionId: key, discordUserId: 'discord-1' });
  const redeemedSession = getSession(key);
  assert.equal(redeemedSession.uses, 1);
  assert.equal(redeemedSession.status, 'exhausted');

  assert.throws(
    () => redeemSession({ sessionId: key, discordUserId: 'discord-2' }),
    /KEY_INACTIVE|KEY_USAGE_LIMIT_REACHED/
  );
});
