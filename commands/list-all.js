
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const itemsPerPage = 10;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('list-all')
        .setDescription('[⚡ Admin] Mostra a lista de AppIDs e licenças.'),

    async execute(interaction, supabase, ICONS, EMBED_COLORS) {
        const embed = new EmbedBuilder()
            .setColor('#FFFFFF')
            .setTitle(`${ICONS.INFO} Listar Informações`)
            .setDescription('Selecione uma das opções abaixo para listar os dados:');
        
        const rowButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('list_app_id_page_1')
                    .setLabel('AppIDs')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('list_license_page_1')
                    .setLabel('Licenças')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.reply({ embeds: [embed], components: [rowButtons], ephemeral: true });
    },

    async handleButton(interaction, supabase, ICONS, EMBED_COLORS) {
        await interaction.deferUpdate();
        
        if (interaction.customId === 'list_back_to_main_page') {
            const embed = new EmbedBuilder()
                .setColor('#FFFFFF')
                .setTitle(`${ICONS.INFO} Listar Informações`)
                .setDescription('Selecione uma das opções abaixo para listar os dados:');
            
            const rowButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('list_app_id_page_1')
                        .setLabel('AppIDs')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('list_license_page_1')
                        .setLabel('Licenças')
                        .setStyle(ButtonStyle.Primary)
                );
            await interaction.editReply({ embeds: [embed], components: [rowButtons] });
            return;
        }

        const parts = interaction.customId.split('_');
        const listType = parts[1] === 'app' ? 'app_id' : 'license';
        const newPage = parseInt(parts.pop());
        
        const offset = (newPage - 1) * itemsPerPage;
        
        try {
            let totalItems, rows;
            let responseMsg = "```asciidoc\n";

            if (listType === 'app_id') {
                const { count, error: countError } = await supabase
                    .from('apps')
                    .select('*', { count: 'exact', head: true });
                
                if (countError) throw countError;
                totalItems = count;

                const { data, error } = await supabase
                    .from('apps')
                    .select('*')
                    .order('active', { ascending: false })
                    .order('app_id', { ascending: true })
                    .range(offset, offset + itemsPerPage - 1);

                if (error) throw error;
                rows = data;

            } else { // listType === 'license'
                const { count, error: countError } = await supabase
                    .from('licenses')
                    .select('*', { count: 'exact', head: true });
                
                if (countError) throw countError;
                totalItems = count;

                const { data, error } = await supabase
                    .from('licenses')
                    .select('app_id, active, expires_at, created_at')
                    .order('created_at', { ascending: false })
                    .range(offset, offset + itemsPerPage - 1);
                
                if (error) throw error;
                rows = data;
            }

            const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
            const embed = new EmbedBuilder().setColor('#FFFFFF');
            
            if (!rows || rows.length === 0) {
                embed.setTitle(`${ICONS.INFO} Nenhum dado encontrado`);
                embed.setDescription(`Não há ${listType === 'app_id' ? 'AppIDs' : 'licenças'} para listar.`);
            } else {
                if (listType === 'app_id') {
                    embed.setTitle(`${ICONS.INFO} Lista de AppIDs`);
                    rows.forEach(row => {
                        let statusEmoji = row.active ? '🟢' : '🔴';
                        let statusText = row.active ? 'Ativo' : 'Inativo';
                        responseMsg += `AppID:: ${row.app_id}\n`;
                        if (row.name) responseMsg += ` Nome:: ${row.name}\n`;
                        responseMsg += ` Status:: ${statusEmoji} ${statusText}\n`;
                        responseMsg += "---\n";
                    });
                } else { // listType === 'license'
                    embed.setTitle(`${ICONS.INFO} Lista de Licenças`);
                    rows.forEach(row => {
                        let statusEmoji = row.active ? '🟢' : '🔴';
                        let expires = row.expires_at ? new Date(row.expires_at).toLocaleDateString('pt-BR') : 'Lifetime';
                        responseMsg += `AppID:: ${row.app_id}\n`;
                        responseMsg += ` Status:: ${statusEmoji} (Exp: ${expires})\n`;
                        responseMsg += "---\n";
                    });
                }
                responseMsg += "```";
                embed.setDescription(responseMsg);
                embed.setFooter({ text: `Página ${newPage} de ${totalPages} • Total: ${totalItems}` });
            }

            // Botões de navegação
            const navRow = new ActionRowBuilder();
            
            if (newPage > 1) {
                navRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`list_${listType === 'app_id' ? 'app_id' : 'license'}_page_${newPage - 1}`)
                        .setLabel('◀ Anterior')
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            navRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('list_back_to_main_page')
                    .setLabel('🏠 Início')
                    .setStyle(ButtonStyle.Secondary)
            );

            if (newPage < totalPages) {
                navRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`list_${listType === 'app_id' ? 'app_id' : 'license'}_page_${newPage + 1}`)
                        .setLabel('Próximo ▶')
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            await interaction.editReply({ embeds: [embed], components: [navRow] });

        } catch (error) {
            console.error('Erro ao listar:', error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLORS.ERROR)
                .setTitle(`${ICONS.ERROR} Erro Interno`)
                .setDescription(`Ocorreu um erro: \`\`\`${error.message}\`\`\``);
            await interaction.editReply({ embeds: [embed] });
        }
    }
};
