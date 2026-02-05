const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const ITEMS_PER_PAGE = 5; // Menos itens para caber bem nos Fields

module.exports = {
    data: new SlashCommandBuilder()
        .setName('listar-keys')
        .setDescription('[⚡ Admin] Lista todas as licenças com paginação e status.'),

    async execute(interaction, supabase, ICONS, EMBED_COLORS) {
        await interaction.deferReply({ ephemeral: true });
        await fetchAndDisplay(interaction, 1, supabase, ICONS, EMBED_COLORS);
    },

    async handleInteraction(interaction, supabase, ICONS, EMBED_COLORS) {
        // Formato: listkeys_page:<PAGE>
        const [prefix, actionWithPage] = interaction.customId.split('_');
        const [action, pageStr] = actionWithPage.split(':');

        if (action === 'page') {
            const page = parseInt(pageStr);
            // Se for interação de botão, defer update
            if (interaction.isButton()) await interaction.deferUpdate();
            await fetchAndDisplay(interaction, page, supabase, ICONS, EMBED_COLORS);
        }
    }
};

async function fetchAndDisplay(interaction, page, supabase, ICONS, EMBED_COLORS) {
    try {
        // 1. Contar total
        const { count, error: countError } = await supabase
            .from('licenses')
            .select('*', { count: 'exact', head: true });

        if (countError) throw countError;

        const totalItems = count || 0;
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

        // Ajustar página se fora dos limites
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;

        const from = (page - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        // 2. Buscar dados paginados
        const { data: licenses, error: dataError } = await supabase
            .from('licenses')
            .select('id, app_id, license_key, active, expires_at, created_at')
            .order('created_at', { ascending: false })
            .range(from, to);

        if (dataError) throw dataError;

        // 3. Montar Embed
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLORS.INFO)
            .setTitle(`${ICONS.INFO} 🔑 Licenças Registradas`)
            .setDescription(`**Total:** ${totalItems} licenças encontradas.\n**Aviso:** As keys originais não podem ser recuperadas.`)
            .setFooter({ text: `Página ${page} de ${totalPages}` })
            .setTimestamp();

        if (!licenses || licenses.length === 0) {
            embed.setDescription('Nenhuma licença encontrada.');
        } else {
            licenses.forEach(lic => {
                const statusInfo = getStatus(lic);
                const maskedHash = maskHash(lic.license_key);
                const expires = lic.expires_at 
                    ? `<t:${Math.floor(new Date(lic.expires_at).getTime() / 1000)}:d>` 
                    : '♾️ Lifetime';

                embed.addFields({
                    name: `📦 App: ${lic.app_id}`,
                    value: `> **Status:** ${statusInfo.emoji} ${statusInfo.text}\n> **Expira:** ${expires}\n> **Hash:** \`${maskedHash}\``,
                    inline: false
                });
            });
        }

        // 4. Botões
        const row = new ActionRowBuilder();

        if (totalPages > 1) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`listkeys_page:${page - 1}`)
                    .setLabel('◀ Anterior')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1),
                
                new ButtonBuilder()
                    .setCustomId(`listkeys_page:${page + 1}`)
                    .setLabel('Próximo ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages)
            );
        }

        // 5. Enviar/Editar
        const payload = { embeds: [embed], components: totalPages > 1 ? [row] : [] };
        
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        } else {
            await interaction.reply({ ...payload, ephemeral: true });
        }

    } catch (err) {
        console.error("Erro em listar-keys:", err);
        const errEmbed = new EmbedBuilder()
            .setColor(EMBED_COLORS.ERROR)
            .setTitle(`${ICONS.ERROR} Erro ao listar licenças`)
            .setDescription(`\`\`\`${err.message}\`\`\``);
        
        if (interaction.deferred || interaction.replied) await interaction.editReply({ embeds: [errEmbed], components: [] });
        else await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }
}

function getStatus(license) {
    if (!license.active) return { text: 'Revogada/Inativa', emoji: '🔴' };
    
    if (license.expires_at) {
        const expires = new Date(license.expires_at);
        if (expires < new Date()) return { text: 'Expirada', emoji: '🟡' };
    }
    
    return { text: 'Ativa', emoji: '🟢' };
}

function maskHash(hash) {
    if (!hash || hash.length < 10) return 'Hash Inválido';
    return `${hash.slice(0, 6)}****${hash.slice(-4)}`;
}
