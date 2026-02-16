# Dashboard Bot (Temporary Discord Role Redeemer)

This project implements the flow you described:

1. User finishes your external task/gate.
2. Your gate provider/server calls this backend (`POST /api/gate/complete`) with proof.
3. Backend verifies completion (server-side only), creates an expiring key/session, and returns a redirect URL (`/${sessionId}`).
4. User runs `/redeem key:<sessionId>` in Discord.
5. Bot validates key against backend, grants temporary role, logs usage to a channel, and revokes role at expiry.

## Security model

- ✅ Validation is **backend-only** (`verifyTaskCompletion` placeholder in `src/server.js`).
- ✅ Session keys are random, expiring, and limited-use.
- ✅ Bot-to-backend calls are protected by `INTERNAL_API_TOKEN`.
- ✅ Gate-to-backend ingestion is protected by `GATE_SHARED_SECRET`.

## Setup

1. Copy env template and fill values:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start API + bot together:
   ```bash
   npm start
   ```

You can also run separately:

```bash
npm run start:api
npm run start:bot
```

## API endpoints

### `POST /api/gate/complete`
Header: `x-gate-secret: <GATE_SHARED_SECRET>`

Body:
```json
{
  "externalUserId": "user-123",
  "taskProof": "proof-from-gate-system",
  "maxUses": 1
}
```

Returns `sessionId`, `expiresAt`, and `redeemUrl`.

### `POST /api/redeem`
Header: `x-internal-api-token: <INTERNAL_API_TOKEN>`

Body:
```json
{
  "key": "session-id",
  "discordUserId": "1234567890"
}
```

## Important customization

- Replace `verifyTaskCompletion` in `src/server.js` with your real gate provider verification.
- Ensure the bot has permissions to manage the target role.
- Place the role **below the bot's highest role** in Discord role hierarchy.

## Transparency note

As requested, this implementation was created with AI assistance and standard public docs for Node.js/Discord.js patterns.
