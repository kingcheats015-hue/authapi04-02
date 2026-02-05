
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gerenciar-app')
        .setDescription('[⚡ Admin] Gerencia um AppID.')
        .addStringOption(option =>
            option.setName('app_id')
                .setDescription('O AppID para gerenciar.')
                .setRequired(true)
                .setAutocomplete(true)),

    async execute(interaction, supabase, ICONS, EMBED_COLORS) {
        await interaction.deferReply({ ephemeral: true });
        const appId = interaction.options.getString('app_id');

        try {
            const { data: app, error } = await supabase.from('apps').select('*').eq('app_id', appId).single();
            if (error || !app) {
                return interaction.editReply({ content: `${ICONS.ERROR} AppID não encontrado.` });
            }

            const stats = await getAppStats(supabase, appId);
            const embed = createAppEmbed(app, stats, ICONS, EMBED_COLORS);
            const components = createAppButtons(app.id);

            await interaction.editReply({ embeds: [embed], components });

        } catch (err) {
            console.error(err);
            interaction.editReply({ content: `${ICONS.ERROR} Erro ao buscar AppID.` });
        }
    },

    async autocomplete(interaction, supabase) {
        const focusedValue = interaction.options.getFocused();
        const { data } = await supabase.from('apps').select('app_id, name').ilike('app_id', `%${focusedValue}%`).limit(25);
        if (data) await interaction.respond(data.map(app => ({ name: `${app.name ?? app.app_id} (${app.app_id})`, value: app.app_id })));
        else await interaction.respond([]);
    },

    async handleInteraction(interaction, supabase, ICONS, EMBED_COLORS) {
        if (interaction.isButton()) {
            const [prefix, actionWithId] = interaction.customId.split('_');
            const [action, uuid] = actionWithId.split(':');

            if (!uuid) return;

            try {
                if (action === 'toggle') {
                    await handleToggleApp(interaction, uuid, supabase, ICONS, EMBED_COLORS);
                } else if (action === 'rename') {
                    await showRenameModal(interaction, uuid);
                } else if (action === 'deactivateall') {
                    await handleDeactivateAll(interaction, uuid, supabase, ICONS, EMBED_COLORS);
                }
            } catch (err) {
                console.error(`Erro app handler button (${action}):`, err);
                if (!interaction.replied && !interaction.deferred) {
                     await interaction.reply({ content: 'Erro ao processar.', ephemeral: true });
                } else {
                     await interaction.followUp({ content: 'Erro ao processar.', ephemeral: true });
                }
            }
        } 
        else if (interaction.isModalSubmit()) {
            const [prefix, actionWithId] = interaction.customId.split('_');
            const [action, uuid] = actionWithId.split(':');
            
            if (!uuid) return;

            try {
                if (action === 'rename') {
                    await handleRenameSubmit(interaction, uuid, supabase, ICONS, EMBED_COLORS);
                }
            } catch (err) {
                 console.error(`Erro app handler modal (${action}):`, err);
                 if (!interaction.replied && !interaction.deferred) {
                     await interaction.reply({ content: 'Erro ao processar.', ephemeral: true });
                 } else {
                     await interaction.followUp({ content: 'Erro ao processar.', ephemeral: true });
                 }
            }
        }
    }
};

// --- Helpers ---

async function getAppStats(supabase, appId) {
    const { count: active } = await supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('app_id', appId).eq('active', true);
    const { count: inactive } = await supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('app_id', appId).eq('active', false);
    // Para banidos, precisamos checar join, mas Supabase JS simples não faz join count direto fácil sem foreign key setup complexo.
    // Vamos simplificar ou assumir 0 se muito complexo para agora, ou fazer query.
    // "Licenças banidas" = licenças cujo HWID está em banned_hwids.
    // Query manual:
    const { data: bannedHwids } = await supabase.from('banned_hwids').select('hwid');
    const bannedSet = new Set(bannedHwids?.map(b => b.hwid) || []);
    
    // Isso pode ser pesado se tiver muitas licenças. Vamos contar apenas se necessário.
    // Para performance, talvez só active/inactive seja suficiente por enquanto.
    return { active: active || 0, inactive: inactive || 0, banned: 'N/A' }; 
}

function createAppEmbed(app, stats, ICONS, EMBED_COLORS) {
    return new EmbedBuilder()
        .setColor(app.active ? EMBED_COLORS.SUCCESS : EMBED_COLORS.ERROR)
        .setTitle(`${ICONS.INFO} Gerenciar AppID`)
        .addFields(
            { name: '📦 AppID', value: `\`${app.app_id}\``, inline: true },
            { name: '📌 Status', value: app.active ? '✅ Ativo' : '🔴 Inativo', inline: true },
            { name: '👥 Licenças Ativas', value: `${stats.active}`, inline: true },
            { name: '⛔ Licenças Inativas', value: `${stats.inactive}`, inline: true }
        )
        .setFooter({ text: `UUID: ${app.id}` })
        .setTimestamp();
}

function createAppButtons(uuid) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`app_toggle:${uuid}`).setLabel('Ativar/Desativar').setStyle(ButtonStyle.Primary).setEmoji('🔴'),
        new ButtonBuilder().setCustomId(`app_rename:${uuid}`).setLabel('Renomear').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId(`app_deactivateall:${uuid}`).setLabel('Desativar Todas Licenças').setStyle(ButtonStyle.Danger).setEmoji('🧹')
    );
    return [row];
}

async function refreshAppMessage(interaction, uuid, supabase, ICONS, EMBED_COLORS) {
    const { data: app } = await supabase.from('apps').select('*').eq('id', uuid).single();
    if (!app) return interaction.update({ content: 'App removido.', embeds: [], components: [] });
    
    const stats = await getAppStats(supabase, app.app_id);
    const embed = createAppEmbed(app, stats, ICONS, EMBED_COLORS);
    const components = createAppButtons(uuid);
    await interaction.update({ embeds: [embed], components });
}

async function handleToggleApp(interaction, uuid, supabase, ICONS, EMBED_COLORS) {
    const { data: current } = await supabase.from('apps').select('active').eq('id', uuid).single();
    await supabase.from('apps').update({ active: !current.active }).eq('id', uuid);
    await refreshAppMessage(interaction, uuid, supabase, ICONS, EMBED_COLORS);
}

async function showRenameModal(interaction, uuid) {
    const modal = new ModalBuilder().setCustomId(`app_rename:${uuid}`).setTitle('Renomear AppID');
    const input = new TextInputBuilder().setCustomId('newname').setLabel('Novo Nome').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
}

async function handleRenameSubmit(interaction, uuid, supabase, ICONS, EMBED_COLORS) {
    await interaction.deferUpdate();
    const newName = interaction.fields.getTextInputValue('newname');
    const { error } = await supabase.from('apps').update({ app_id: newName }).eq('id', uuid);
    
    if (error && error.code === '23505') return interaction.followUp({ content: 'Nome já existe.', ephemeral: true });
    
    await refreshAppMessage(interaction, uuid, supabase, ICONS, EMBED_COLORS);
}

async function handleDeactivateAll(interaction, uuid, supabase, ICONS, EMBED_COLORS) {
    // Pegar o app_id
    const { data: app } = await supabase.from('apps').select('app_id').eq('id', uuid).single();
    if (!app) return;

    await supabase.from('licenses').update({ active: false }).eq('app_id', app.app_id);
    
    await interaction.reply({ content: `Todas as licenças de **${app.app_id}** foram desativadas.`, ephemeral: true });
    // Não precisa dar refresh no embed principal necessariamente, mas stats mudariam.
    // Vamos tentar dar refresh se possível (mas reply já foi enviado).
    // O usuário pode clicar no botão de novo ou re-executar.
}
