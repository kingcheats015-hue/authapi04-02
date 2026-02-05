const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('criar-app')
        .setDescription('[⚡ Admin] Cria um novo AppID.')
        .addStringOption(option =>
            option.setName('app_id')
                .setDescription('O identificador único do App.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('nome')
                .setDescription('O nome legível do App (opcional).')
                .setRequired(false)),

    async execute(interaction, supabase, ICONS, EMBED_COLORS) {
        await interaction.deferReply({ ephemeral: true });
        const appId = interaction.options.getString('app_id');
        const name = interaction.options.getString('nome');

        try {
            // Verificar se já existe
            const { data: existing } = await supabase.from('apps').select('id').eq('app_id', appId).single();
            if (existing) {
                return interaction.editReply({ content: `${ICONS.ERROR} O AppID \`${appId}\` já existe.` });
            }

            const payload = {
                app_id: appId,
                active: true,
                created_at: new Date()
            };
            if (name) payload.name = name; // Tenta inserir nome se fornecido (assume que coluna existe)

            const { error } = await supabase.from('apps').insert([payload]);

            if (error) {
                if (error.code === '23505') { // Unique violation
                    return interaction.editReply({ content: `${ICONS.ERROR} O AppID \`${appId}\` já existe.` });
                }
                throw error;
            }

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLORS.SUCCESS)
                .setTitle(`${ICONS.SUCCESS} App Criado com Sucesso`)
                .addFields(
                    { name: '📦 AppID', value: `\`${appId}\``, inline: true },
                    { name: '🏷️ Nome', value: name ? `\`${name}\`` : 'Não definido', inline: true },
                    { name: '📌 Status', value: '✅ Ativo', inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            interaction.editReply({ content: `${ICONS.ERROR} Erro ao criar AppID: ${err.message}` });
        }
    }
};
