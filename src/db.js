const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { config } = require('./config');

const EMPTY_DB = {
  sessions: {},
  redemptions: {},
  grants: {}
};

function ensureDbFile() {
  const dir = path.dirname(config.dataFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(config.dataFilePath)) {
    fs.writeFileSync(config.dataFilePath, JSON.stringify(EMPTY_DB, null, 2));
  }
}

function readDb() {
  ensureDbFile();
  const data = fs.readFileSync(config.dataFilePath, 'utf8');
  const parsed = JSON.parse(data);
  return {
    ...EMPTY_DB,
    ...parsed,
    sessions: parsed.sessions || {},
    redemptions: parsed.redemptions || {},
    grants: parsed.grants || {}
  };
}

function writeDb(next) {
  const temp = `${config.dataFilePath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(next, null, 2));
  fs.renameSync(temp, config.dataFilePath);
}

function withDb(updater) {
  const current = readDb();
  const next = updater(structuredClone(current));
  writeDb(next);
  return next;
}

function createSession({ externalUserId, metadata, expiresAt, maxUses }) {
  const sessionId = randomUUID().replace(/-/g, '');
  const nowIso = new Date().toISOString();

  withDb((db) => {
    db.sessions[sessionId] = {
      id: sessionId,
      externalUserId,
      metadata,
      createdAt: nowIso,
      expiresAt,
      maxUses,
      uses: 0,
      status: 'active'
    };
    return db;
  });

  return sessionId;
}

function getSession(sessionId) {
  return readDb().sessions[sessionId] || null;
}

function redeemSession({ sessionId, discordUserId }) {
  return withDb((db) => {
    const session = db.sessions[sessionId];
    if (!session) {
      throw new Error('KEY_NOT_FOUND');
    }

    if (session.status !== 'active') {
      throw new Error('KEY_INACTIVE');
    }

    if (new Date(session.expiresAt).getTime() < Date.now()) {
      session.status = 'expired';
      throw new Error('KEY_EXPIRED');
    }

    if (session.uses >= session.maxUses) {
      session.status = 'exhausted';
      throw new Error('KEY_USAGE_LIMIT_REACHED');
    }

    session.uses += 1;
    if (session.uses >= session.maxUses) {
      session.status = 'exhausted';
    }

    const redemptionId = randomUUID();
    const redeemedAt = new Date().toISOString();
    db.redemptions[redemptionId] = {
      id: redemptionId,
      sessionId,
      discordUserId,
      redeemedAt,
      usageNumber: session.uses
    };

    return db;
  });
}

function addGrant({ discordUserId, guildId, roleId, expiresAt }) {
  const id = randomUUID();
  withDb((db) => {
    db.grants[id] = {
      id,
      discordUserId,
      guildId,
      roleId,
      status: 'active',
      grantedAt: new Date().toISOString(),
      expiresAt,
      revokedAt: null
    };
    return db;
  });
  return id;
}

function getActiveGrants() {
  return Object.values(readDb().grants).filter((grant) => grant.status === 'active');
}

function markGrantRevoked(grantId) {
  withDb((db) => {
    const grant = db.grants[grantId];
    if (!grant) return db;
    grant.status = 'revoked';
    grant.revokedAt = new Date().toISOString();
    return db;
  });
}

module.exports = {
  createSession,
  getSession,
  redeemSession,
  addGrant,
  getActiveGrants,
  markGrantRevoked
};
