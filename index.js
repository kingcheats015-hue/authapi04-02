const { Client, GatewayIntentBits, Collection, EmbedBuilder, WebhookClient } = require('discord.js');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const gradient = require('gradient-string');
const supabase = require('./utils/supabaseClient.js');
const sendSystemStatus = require('./services/systemStatus.js');
const chalk = require('chalk');

dotenv.config();

// 🔎 Debug das envs
console.log("🔍 WEBHOOK_URL:", process.env.WEBHOOK_URL ? "OK ✅" : "NÃO DEFINIDA ❌");
console.log("🔍 SUPABASE_URL:", process.env.SUPABASE_URL ? "OK ✅" : "NÃO DEFINIDA ❌");

// Ícones e cores
const ICONS = {
    SUCCESS: '<:icons_dgreen:1409014970863194142>',
    ERROR: '<:icons_dred:1409014934502768722>',
    WARNING: '<:icons_dyellow:1409015004849504368>',
    INFO: '<:icons_dwhite:1409015041470238740>'
};

const EMBED_COLORS = {
    SUCCESS: '#00FF00',
    ERROR: '#FF0000',
    WARNING: '#FFFF00',
    INFO: '#FFFFFF'
};

// Webhook (logs)
let webhookClient = null;
if (process.env.WEBHOOK_URL) {
    webhookClient = new WebhookClient({ url: process.env.WEBHOOK_URL });
    console.log("✅ Webhook configurado!");
} else {
    console.warn("⚠️ Nenhum WEBHOOK_URL encontrado no .env — logs apenas no console.");
}

// Mapeamento de interações
const interactionCommandMap = {
    'list': 'list-all',
    'license': 'gerenciar-licenca',
    'app': 'gerenciar-app',
    'listkeys': 'listar-keys'
};

// Cargos autorizados
const REQUIRED_ROLE_IDS = process.env.REQUIRED_ROLE_ID ? process.env.REQUIRED_ROLE_ID.split(',').map(id => id.trim()) : [];

// Cliente Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Carregar comandos
const commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) commands.set(command.data.name, command);
    else console.log(chalk.yellow(`[AVISO] O arquivo ${filePath} está com formato incorreto.`));
}

// ASCII art TERMONIX
const asciiTitle = `
  _____   ___   ___   __  __    ___    _  _   ___  __  __
 |_   _| | __| | _ \\ |  \\/  |  / _ \\  | \\| | |_ _| \\ \\/ /
   | |   | _|  |   / | |\\/| | | (_) | | .\` |  | |   >  < 
   |_|   |___| |_|_\\ |_|  |_|  \\___/  |_|\\_| |___| /_/\\_\\
`;

// Função painel
function logPanel({ botTag, botId, commands = [], dbStatus = {}, errors = [] }) {
    console.clear();
    console.log(gradient('red', 'yellow')(asciiTitle));

    console.log(chalk.green.bold('\n=== Status do Bot ==='));
    console.log(`${chalk.cyan('🤖 Bot:')} ${chalk.yellow(botTag)}`);
    console.log(`${chalk.cyan('🆔 ID:')} ${chalk.yellow(botId)}\n`);

    console.log(chalk.green.bold('=== Banco de Dados (Supabase) ==='));
    for (const [name, status] of Object.entries(dbStatus)) {
        console.log(`${chalk.cyan(name)}: ${status ? chalk.green('Conectado ✅') : chalk.red('Erro ❌')}`);
    }
    console.log();

    console.log(chalk.green.bold('=== Comandos Registrados ==='));
    if (commands.length === 0) console.log(chalk.yellow('Nenhum comando registrado ainda.'));
    else commands.forEach(cmd => console.log(`${chalk.green('✔')} ${cmd}`));
    console.log();

    if (errors.length > 0) {
        console.log(chalk.red.bold('=== Erros ==='));
        errors.forEach(err => console.log(chalk.red(`❌ ${err}`)));
        console.log();
    }

    console.log(chalk.magenta('==============================\n'));
}

// Função para logar no webhook
async function sendLog({ type = "INFO", title = "Log", description = "", interaction = null }) {
    let timeFieldValue = `<t:${Math.floor(Date.now() / 1000)}:R>`; // default: agora

    if (interaction && interaction.createdTimestamp) {
        const timestamp = Math.floor(interaction.createdTimestamp / 1000);
        timeFieldValue = `<t:${timestamp}:R>`;
    }

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS[type] || EMBED_COLORS.INFO)
        .setTitle(`${ICONS[type]} ${title}`)
        .setDescription(description)
        .addFields(
            interaction ? [
                { name: "👤 Usuário", value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
                { name: "⏰ Quando", value: timeFieldValue, inline: true }
            ] : []
        )
        .setTimestamp();

    if (webhookClient) {
        try { await webhookClient.send({ embeds: [embed] }); }
        catch (err) { console.error("Erro ao enviar log para webhook:", err.message); }
    } else {
        console.log(`[${type}] ${title} - ${description}`);
    }
}

// Evento ready
client.once('ready', async () => {
    let supabaseStatus = false;
    try {
        const { error } = await supabase
  .from('apps')
  .select('*', { count: 'exact', head: true });

        if (!error) supabaseStatus = true;
    } catch (e) {
        console.error("Erro ao conectar Supabase:", e);
    }

    const dbStatus = { 'Supabase': supabaseStatus };
    const commandsList = Array.from(commands.keys());

    logPanel({ botTag: client.user.tag, botId: client.user.id, commands: commandsList, dbStatus, errors: [] });

    try {
        await client.application.commands.set(commandsList.map(name => commands.get(name).data.toJSON()));
        console.log(chalk.green('\n✅ Todos os comandos foram registrados com sucesso!\n'));

        await sendLog({
            type: "SUCCESS",
            title: "Bot Online",
            description: `🤖 **${client.user.tag}** está online com **${commandsList.length} comandos**.\n📦 Backend: **Supabase**`
        });

        // Enviar status inicial do sistema e iniciar intervalo de 24h
        await sendSystemStatus(client, commandsList.length);
        setInterval(() => sendSystemStatus(client, commandsList.length), 24 * 60 * 60 * 1000);

    } catch (error) {
        console.error(error);
        logPanel({ botTag: client.user.tag, botId: client.user.id, commands: commandsList, dbStatus, errors: [error.message] });
    }
});

// Interações
client.on('interactionCreate', async interaction => {
    let commandName;
    if (interaction.isChatInputCommand()) commandName = interaction.commandName;
    else if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        const [prefix] = interaction.customId.split('_');
        commandName = interactionCommandMap[prefix];
    } else if (interaction.isAutocomplete()) commandName = interaction.commandName;
    else return;

    const command = commands.get(commandName);
    if (!command) {
        // Fallback or ignore
        return;
    }

    try {
        // 🔒 Controle de acesso (exceto get-expiration que não requer auth especial, se houver)
        // Ajuste conforme necessidade.
        if (interaction.isChatInputCommand()) {
             const member = interaction.member;
             if (!member.roles.cache.some(role => REQUIRED_ROLE_IDS.includes(role.id))) {
                 const noPermEmbed = new EmbedBuilder()
                     .setColor(EMBED_COLORS.ERROR)
                     .setTitle(`${ICONS.ERROR} Acesso Negado`)
                     .setDescription(`❌ Você **não tem permissão** para executar o comando \`${commandName}\`.`)
                     .setFooter({ text: "Contate um administrador caso ache que isso é um erro." })
                     .setTimestamp();
 
                 await sendLog({
                     type: "WARNING",
                     title: "Acesso Negado",
                     description: `🚫 ${interaction.user.tag} tentou usar \`${commandName}\` sem permissão.`,
                     interaction
                 });
 
                 return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
             }
        }

        if (interaction.isChatInputCommand()) {
            await command.execute(interaction, supabase, ICONS, EMBED_COLORS);
        } 
        else if (interaction.isAutocomplete()) {
            if (command.autocomplete) await command.autocomplete(interaction, supabase);
        }
        else if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
            if (command.handleInteraction) {
                await command.handleInteraction(interaction, supabase, ICONS, EMBED_COLORS);
            } else {
                if (interaction.isButton() && command.handleButton) await command.handleButton(interaction, supabase, ICONS, EMBED_COLORS);
                else if (interaction.isStringSelectMenu() && command.handleSelectMenu) await command.handleSelectMenu(interaction, supabase, ICONS, EMBED_COLORS);
                else if (interaction.isModalSubmit() && command.handleModalSubmit) await command.handleModalSubmit(interaction, supabase, ICONS, EMBED_COLORS);
            }
        }

    } catch (error) {
        console.error(error);

        await sendLog({
            type: "ERROR",
            title: "Erro Interno",
            description: `💥 Comando: \`${commandName}\`\n👤 Usuário: ${interaction.user.tag}\n\`\`\`${error.message}\`\`\``,
            interaction
        });

        // Autocomplete não suporta reply/editReply com mensagens
        if (interaction.isAutocomplete()) return;

        const embed = new EmbedBuilder()
            .setColor(EMBED_COLORS.ERROR)
            .setTitle(`${ICONS.ERROR} Erro`)
            .setDescription(`Ocorreu um erro interno: \`\`\`${error.message}\`\`\``);

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [embed], ephemeral: true });
            } else if (interaction.isRepliable()) {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (replyError) {
            console.error("Erro ao enviar resposta de erro:", replyError);
        }
    }
});

// Login
client.login(process.env.DISCORD_BOT_TOKEN);
