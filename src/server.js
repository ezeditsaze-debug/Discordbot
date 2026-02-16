const express = require('express');
const { config } = require('./config');
const { createSession, getSession, redeemSession } = require('./db');

const app = express();
app.use(express.json());

function assertGateSecret(req, res, next) {
  const incoming = req.header('x-gate-secret');
  if (!incoming || incoming !== config.gateSharedSecret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
}

function assertInternalApiToken(req, res, next) {
  const incoming = req.header('x-internal-api-token');
  if (!incoming || incoming !== config.internalApiToken) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
}

async function verifyTaskCompletion({ taskProof }) {
  // Replace this placeholder with your external provider's API call.
  // Keep this validation on the server side only.
  return Boolean(taskProof && typeof taskProof === 'string' && taskProof.trim().length > 0);
}

app.post('/api/gate/complete', assertGateSecret, async (req, res) => {
  const { externalUserId, taskProof, maxUses } = req.body;
  if (!externalUserId || !taskProof) {
    return res.status(400).json({ error: 'externalUserId and taskProof are required' });
  }

  const isValid = await verifyTaskCompletion({ taskProof });
  if (!isValid) {
    return res.status(403).json({ error: 'task verification failed' });
  }

  const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000).toISOString();
  const sessionId = createSession({
    externalUserId,
    metadata: { taskProofHashHint: `${taskProof.slice(0, 6)}...` },
    expiresAt,
    maxUses: Number.isInteger(maxUses) && maxUses > 0 ? maxUses : config.defaultKeyMaxUses
  });

  return res.status(201).json({
    sessionId,
    expiresAt,
    redeemUrl: `${config.baseUrl}/${sessionId}`
  });
});

app.get('/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    return res.status(404).send('<h1>Invalid session key.</h1>');
  }

  const expired = new Date(session.expiresAt).getTime() < Date.now();
  if (expired) {
    return res.status(410).send('<h1>This session has expired.</h1>');
  }

  return res.send(`
    <html>
      <body style="font-family: sans-serif; max-width: 600px; margin: 40px auto; line-height: 1.5;">
        <h1>Access granted ✅</h1>
        <p>Your key has been generated. Open Discord and run:</p>
        <pre style="background:#f4f4f4;padding:12px;border-radius:8px;">/redeem key:${session.id}</pre>
        <p>This key expires at <strong>${new Date(session.expiresAt).toLocaleString()}</strong>.</p>
      </body>
    </html>
  `);
});

app.post('/api/redeem', assertInternalApiToken, (req, res) => {
  const { key, discordUserId } = req.body;
  if (!key || !discordUserId) {
    return res.status(400).json({ error: 'key and discordUserId are required' });
  }

  try {
    const db = redeemSession({ sessionId: key, discordUserId });
    const session = db.sessions[key];

    return res.status(200).json({
      valid: true,
      key,
      usageNumber: session.uses,
      maxUses: session.maxUses,
      expiresAt: session.expiresAt,
      roleDurationMinutes: config.roleDurationMinutes
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    return res.status(400).json({ valid: false, error: code });
  }
});

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`API listening on :${config.port}`);
  });
}

module.exports = { app };
