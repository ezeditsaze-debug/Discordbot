const path = require('node:path');
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

const config = {
  port: toInt('PORT', 3000),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  gateSharedSecret: requireEnv('GATE_SHARED_SECRET'),
  sessionTtlSeconds: toInt('SESSION_TTL_SECONDS', 1800),
  defaultKeyMaxUses: toInt('DEFAULT_KEY_MAX_USES', 1),
  roleDurationMinutes: toInt('ROLE_DURATION_MINUTES', 60),
  discordBotToken: process.env.DISCORD_BOT_TOKEN,
  discordGuildId: process.env.DISCORD_GUILD_ID,
  discordRoleId: process.env.DISCORD_ROLE_ID,
  discordLogChannelId: process.env.DISCORD_LOG_CHANNEL_ID,
  internalApiToken: requireEnv('INTERNAL_API_TOKEN'),
  dataFilePath: path.join(process.cwd(), 'data', 'store.json')
};

module.exports = { config };
