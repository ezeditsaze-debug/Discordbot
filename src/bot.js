const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  Events
} = require('discord.js');
const { config } = require('./config');
const { addGrant, getActiveGrants, markGrantRevoked } = require('./db');

if (!config.discordBotToken || !config.discordGuildId || !config.discordRoleId || !config.discordLogChannelId) {
  throw new Error('Missing Discord bot environment variables.');
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('redeem')
      .setDescription('Redeem your access key for a temporary role')
      .addStringOption((option) =>
        option
          .setName('key')
          .setDescription('The key from your gate-complete session')
          .setRequired(true)
      )
  ].map((command) => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(config.discordBotToken);
  await rest.put(Routes.applicationGuildCommands((await client.application.fetch()).id, config.discordGuildId), {
    body: commands
  });
}

async function removeRoleWhenExpired(grant, reason = 'Grant expired') {
  if (new Date(grant.expiresAt).getTime() > Date.now()) {
    return;
  }

  const guild = await client.guilds.fetch(grant.guildId);
  const member = await guild.members.fetch(grant.discordUserId).catch(() => null);
  if (member && member.roles.cache.has(grant.roleId)) {
    await member.roles.remove(grant.roleId, reason);
  }
  markGrantRevoked(grant.id);
}

function scheduleGrantRevocation(grant) {
  const delay = new Date(grant.expiresAt).getTime() - Date.now();
  if (delay <= 0) {
    removeRoleWhenExpired(grant).catch(console.error);
    return;
  }

  setTimeout(() => {
    removeRoleWhenExpired(grant).catch(console.error);
  }, delay);
}

async function redeemKeyFromApi(key, discordUserId) {
  const response = await fetch(`${config.baseUrl}/api/redeem`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-api-token': config.internalApiToken
    },
    body: JSON.stringify({ key, discordUserId })
  });

  return response.json();
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerSlashCommands();

  for (const grant of getActiveGrants()) {
    scheduleGrantRevocation(grant);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'redeem') return;

  const key = interaction.options.getString('key', true).trim();
  await interaction.deferReply({ ephemeral: true });

  const apiResult = await redeemKeyFromApi(key, interaction.user.id);
  if (!apiResult.valid) {
    await interaction.editReply(`❌ Key invalid: ${apiResult.error}`);
    return;
  }

  const guild = await client.guilds.fetch(config.discordGuildId);
  const member = await guild.members.fetch(interaction.user.id);
  await member.roles.add(config.discordRoleId, `Redeemed key ${key}`);

  const expiresAt = new Date(Date.now() + apiResult.roleDurationMinutes * 60 * 1000).toISOString();
  const grantId = addGrant({
    discordUserId: interaction.user.id,
    guildId: guild.id,
    roleId: config.discordRoleId,
    expiresAt
  });

  scheduleGrantRevocation({
    id: grantId,
    discordUserId: interaction.user.id,
    guildId: guild.id,
    roleId: config.discordRoleId,
    expiresAt
  });

  const logChannel = await client.channels.fetch(config.discordLogChannelId);
  if (logChannel?.isTextBased()) {
    await logChannel.send(
      [
        '🔑 **Key Redeemed**',
        `User: <@${interaction.user.id}> (${interaction.user.id})`,
        `Time: ${new Date().toISOString()}`,
        `Key: ${key}`,
        `Usage count: ${apiResult.usageNumber}/${apiResult.maxUses}`,
        `Role expires at: ${expiresAt}`
      ].join('\n')
    );
  }

  await interaction.editReply(`✅ Role granted! It will be removed at ${new Date(expiresAt).toLocaleString()}.`);
});

if (require.main === module) {
  client.login(config.discordBotToken);
}

module.exports = { client, scheduleGrantRevocation };
