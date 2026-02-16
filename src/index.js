const { app } = require('./server');
const { client } = require('./bot');
const { config } = require('./config');

app.listen(config.port, () => {
  console.log(`API listening on :${config.port}`);
});

client.login(config.discordBotToken);
