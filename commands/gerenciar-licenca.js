
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const crypto = require('crypto');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gerenciar-licenca')
        .setDescription('[⚡ Admin] Gerencia uma licença específica.')
        .addStringOption(option =>
            option.setName('license_key')
                .setDescription('A License Key para gerenciar.')
                .setRequired(true)),

    async execute(interaction, supabase, ICONS, EMBED_COLORS) {
        await interaction.deferReply({ ephemeral: true });

        const rawKey = interaction.options.getString('license_key');
        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

        try {
            // Buscar licença
            // Nota: Usando 'license_key' conforme novo modelo. Se falhar, pode ser 'key_hash'.
            const { data: license, error } = await supabase
                .from('licenses')
                .select('*')
                .eq('license_key', keyHash)
                .single();

            if (error || !license) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor(EMBED_COLORS.ERROR)
                        .setTitle(`${ICONS.ERROR} Licença não encontrada`)
                        .setDescription(`Nenhuma licença encontrada para a key fornecida.`)
                    ]
                });
            }

            // Verificar se HWID está banido
            let isBanned = false;
            if (license.hwid) {
                const { data: bannedData } = await supabase
                    .from('banned_hwids')
                    .select('id')
                    .eq('hwid', license.hwid)
                    .single();
                if (bannedData) isBanned = true;
            }

            const embed = createLicenseEmbed(license, isBanned, ICONS, EMBED_COLORS);
            const components = createLicenseButtons(license.id, isBanned);

            await interaction.editReply({ embeds: [embed], components });

        } catch (err) {
            console.error(err);
            interaction.editReply({ content: `${ICONS.ERROR} Erro ao buscar licença.` });
        }
    },

    async handleInteraction(interaction, supabase, ICONS, EMBED_COLORS) {
        // Formato customId: license_<action>:<uuid>
        const [prefix, actionWithId] = interaction.customId.split('_'); // prefix = license
        const [action, uuid] = actionWithId.split(':');

        if (!uuid) return;

        try {
            // Ações de botões
            if (interaction.isButton()) {
                if (action === 'toggle') {
                    await handleToggle(interaction, uuid, supabase, ICONS, EMBED_COLORS);
                } else if (action === 'reset') {
                    await handleResetHWID(interaction, uuid, supabase, ICONS, EMBED_COLORS);
                } else if (action === 'extend') {
                    await showExtendModal(interaction, uuid);
                } else if (action === 'setexp') {
                    await showSetExpirationModal(interaction, uuid);
                } else if (action === 'changeapp') {
                    await showChangeAppSelect(interaction, uuid, supabase);
                } else if (action === 'ban') {
                    await handleBanHWID(interaction, uuid, supabase, ICONS, EMBED_COLORS);
                } else if (action === 'unban') {
                    await handleUnbanHWID(interaction, uuid, supabase, ICONS, EMBED_COLORS);
                } else if (action === 'delete') {
                    await handleDelete(interaction, uuid, supabase, ICONS, EMBED_COLORS);
                }
            }
            // Ações de Modals
            else if (interaction.isModalSubmit()) {
                if (action === 'extend') {
                    await handleExtendSubmit(interaction, uuid, supabase, ICONS, EMBED_COLORS);
                } else if (action === 'setexp') {
                    await handleSetExpirationSubmit(interaction, uuid, supabase, ICONS, EMBED_COLORS);
                }
            }
            // Ações de Select Menu
            else if (interaction.isStringSelectMenu()) {
                if (action === 'changeapp') {
                    await handleChangeAppSubmit(interaction, uuid, supabase, ICONS, EMBED_COLORS);
                }
            }
        } catch (err) {
            console.error(`Erro em license handler (${action}):`, err);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `${ICONS.ERROR} Ocorreu um erro ao processar a ação.`, ephemeral: true });
            } else {
                await interaction.followUp({ content: `${ICONS.ERROR} Ocorreu um erro ao processar a ação.`, ephemeral: true });
            }
        }
    }
};

// --- Helpers ---

function createLicenseEmbed(license, isBanned, ICONS, EMBED_COLORS) {
    const status = license.active ? '✅ Ativa' : '🔴 Desativada';
    const expiration = license.expires_at ? new Date(license.expires_at).toLocaleString('pt-BR') : 'Nunca (Lifetime)';
    const lastLogin = license.last_login_at ? `<t:${Math.floor(new Date(license.last_login_at).getTime() / 1000)}:R>` : 'Nunca';
    
    return new EmbedBuilder()
        .setColor(isBanned ? EMBED_COLORS.ERROR : (license.active ? EMBED_COLORS.SUCCESS : EMBED_COLORS.WARNING))
        .setTitle(`${ICONS.INFO} Gerenciar Licença`)
        .addFields(
            { name: '🔑 License Hash', value: `\`${license.license_key.substring(0, 10)}...\``, inline: true }, // Mostrar parcial
            { name: '📦 AppID', value: `\`${license.app_id}\``, inline: true },
            { name: '📌 Status', value: status, inline: true },
            { name: '⏳ Expiração', value: `\`${expiration}\``, inline: true },
            { name: '🖥️ HWID', value: license.hwid ? `\`${license.hwid}\`` : 'Não vinculado', inline: true },
            { name: '🚫 Banido?', value: isBanned ? '**SIM** ⛔' : 'Não', inline: true },
            { name: '🌐 Último IP', value: license.last_ip || 'N/A', inline: true },
            { name: '🕒 Último Login', value: lastLogin, inline: true }
        )
        .setFooter({ text: `ID: ${license.id}` })
        .setTimestamp();
}

function createLicenseButtons(uuid, isBanned) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`license_toggle:${uuid}`).setLabel('Ativar/Desativar').setStyle(ButtonStyle.Primary).setEmoji('🔴'),
        new ButtonBuilder().setCustomId(`license_reset:${uuid}`).setLabel('Reset HWID').setStyle(ButtonStyle.Secondary).setEmoji('♻️'),
        new ButtonBuilder().setCustomId(`license_extend:${uuid}`).setLabel('Extend Time').setStyle(ButtonStyle.Success).setEmoji('➕')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`license_setexp:${uuid}`).setLabel('Set Expiration').setStyle(ButtonStyle.Secondary).setEmoji('📆'),
        new ButtonBuilder().setCustomId(`license_changeapp:${uuid}`).setLabel('Change App').setStyle(ButtonStyle.Secondary).setEmoji('🔁'),
        new ButtonBuilder().setCustomId(`license_ban:${uuid}`).setLabel('Ban HWID').setStyle(ButtonStyle.Danger).setEmoji('🚫').setDisabled(isBanned)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`license_unban:${uuid}`).setLabel('Unban HWID').setStyle(ButtonStyle.Success).setEmoji('❌').setDisabled(!isBanned),
        new ButtonBuilder().setCustomId(`license_delete:${uuid}`).setLabel('Delete License').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );

    return [row1, row2, row3];
}

// --- Handlers ---

async function refreshMessage(interaction, uuid, supabase, ICONS, EMBED_COLORS) {
    const { data: license } = await supabase.from('licenses').select('*').eq('id', uuid).single();
    if (!license) return interaction.update({ content: `${ICONS.ERROR} Licença não existe mais.`, embeds: [], components: [] });

    let isBanned = false;
    if (license.hwid) {
        const { data } = await supabase.from('banned_hwids').select('id').eq('hwid', license.hwid).single();
        if (data) isBanned = true;
    }

    const embed = createLicenseEmbed(license, isBanned, ICONS, EMBED_COLORS);
    const components = createLicenseButtons(uuid, isBanned);
    await interaction.update({ embeds: [embed], components });
}

async function handleToggle(interaction, uuid, supabase, ICONS, EMBED_COLORS) {
    const { data: current } = await supabase.from('licenses').select('active').eq('id', uuid).single();
    if (!current) return interaction.reply({ content: 'Licença não encontrada.', ephemeral: true });

    const { error } = await supabase.from('licenses').update({ active: !current.active }).eq('id', uuid);
    if (error) throw error;
    await refreshMessage(interaction, uuid, supabase, ICONS, EMBED_COLORS);
}

async function handleResetHWID(interaction, uuid, supabase, ICONS, EMBED_COLORS) {
    const { error } = await supabase.from('licenses').update({ hwid: null }).eq('id', uuid);
    if (error) throw error;
    await refreshMessage(interaction, uuid, supabase, ICONS, EMBED_COLORS);
}

async function showExtendModal(interaction, uuid) {
    const modal = new ModalBuilder()
        .setCustomId(`license_extend:${uuid}`)
        .setTitle('Estender Licença');

    const daysInput = new TextInputBuilder()
        .setCustomId('days')
        .setLabel('Dias para adicionar')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 30')
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(daysInput));
    await interaction.showModal(modal);
}

async function handleExtendSubmit(interaction, uuid, supabase, ICONS, EMBED_COLORS) {
    await interaction.deferUpdate();
    const days = parseInt(interaction.fields.getTextInputValue('days'));
    if (isNaN(days)) return interaction.followUp({ content: 'Número inválido.', ephemeral: true });

    const { data: license } = await supabase.from('licenses').select('expires_at').eq('id', uuid).single();
    if (!license) return;

    let newDate = license.expires_at ? new Date(license.expires_at) : new Date();
    if (newDate < new Date()) newDate = new Date(); // Se já expirou, começa de agora
    newDate.setDate(newDate.getDate() + days);

    await supabase.from('licenses').update({ expires_at: newDate.toISOString() }).eq('id', uuid);
    await refreshMessage(interaction, uuid, supabase, ICONS, EMBED_COLORS);
}

async function showSetExpirationModal(interaction, uuid) {
    const modal = new ModalBuilder()
        .setCustomId(`license_setexp:${uuid}`)
        .setTitle('Definir Expiração');

    const dateInput = new TextInputBuilder()
        .setCustomId('date')
        .setLabel('Data (YYYY-MM-DD)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 2025-12-31')
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(dateInput));
    await interaction.showModal(modal);
}

async function handleSetExpirationSubmit(interaction, uuid, supabase, ICONS, EMBED_COLORS) {
    await interaction.deferUpdate();
    const dateStr = interaction.fields.getTextInputValue('date');
    const date = new Date(dateStr);
    
    if (isNaN(date.getTime())) return interaction.followUp({ content: 'Data inválida.', ephemeral: true });

    await supabase.from('licenses').update({ expires_at: date.toISOString() }).eq('id', uuid);
    await refreshMessage(interaction, uuid, supabase, ICONS, EMBED_COLORS);
}

async function showChangeAppSelect(interaction, uuid, supabase) {
    const { data: apps } = await supabase.from('apps').select('app_id').eq('active', true);
    if (!apps || apps.length === 0) return interaction.reply({ content: 'Nenhum AppID ativo encontrado.', ephemeral: true });

    const options = apps.map(app => ({ label: app.app_id, value: app.app_id }));
    const select = new StringSelectMenuBuilder()
        .setCustomId(`license_changeapp:${uuid}`)
        .setPlaceholder('Selecione o novo AppID')
        .addOptions(options.slice(0, 25)); // Max 25 options

    const row = new ActionRowBuilder().addComponents(select);
    await interaction.reply({ content: 'Selecione o novo AppID:', components: [row], ephemeral: true });
}

async function handleChangeAppSubmit(interaction, uuid, supabase, ICONS, EMBED_COLORS) {
    const newAppId = interaction.values[0];
    await supabase.from('licenses').update({ app_id: newAppId }).eq('id', uuid);
    await interaction.update({ content: `AppID alterado para ${newAppId}`, components: [] });
    // Precisamos atualizar o embed original, mas como é ephemeral response do select, não afeta o main.
    // O usuário pode clicar nos botões do main para atualizar se quiser, ou podemos tentar editar a mensagem original se tivermos ref.
    // Simplificação: apenas confirma.
}

async function handleBanHWID(interaction, uuid, supabase, ICONS, EMBED_COLORS) {
    const { data: license } = await supabase.from('licenses').select('hwid').eq('id', uuid).single();
    if (!license || !license.hwid) return interaction.reply({ content: 'Esta licença não possui HWID vinculado para banir.', ephemeral: true });

    const { error } = await supabase.from('banned_hwids').insert([{ hwid: license.hwid, reason: 'Banido via painel Discord', created_at: new Date().toISOString() }]);
    
    if (error && error.code === '23505') { // Duplicado
        return interaction.reply({ content: 'Este HWID já está banido.', ephemeral: true });
    }
    
    await refreshMessage(interaction, uuid, supabase, ICONS, EMBED_COLORS);
}

async function handleUnbanHWID(interaction, uuid, supabase, ICONS, EMBED_COLORS) {
    const { data: license } = await supabase.from('licenses').select('hwid').eq('id', uuid).single();
    if (!license || !license.hwid) return interaction.reply({ content: 'Licença sem HWID.', ephemeral: true });

    await supabase.from('banned_hwids').delete().eq('hwid', license.hwid);
    await refreshMessage(interaction, uuid, supabase, ICONS, EMBED_COLORS);
}

async function handleDelete(interaction, uuid, supabase, ICONS, EMBED_COLORS) {
    // Confirmação simples via update direto
    await supabase.from('licenses').delete().eq('id', uuid);
    await interaction.update({ content: '🗑️ Licença deletada com sucesso.', embeds: [], components: [] });
}
