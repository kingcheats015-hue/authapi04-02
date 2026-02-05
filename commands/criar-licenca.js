const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const crypto = require('crypto');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('criar-licenca')
        .setDescription('[⚡ Admin] Cria uma nova licença.')
        .addStringOption(option =>
            option.setName('app_id')
                .setDescription('O AppID para a licença.')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('duracao')
                .setDescription('A duração da licença.')
                .setRequired(true)
                .addChoices(
                    { name: '1 Dia', value: '1d' },
                    { name: '3 Dias', value: '3d' },
                    { name: '7 Dias', value: '7d' },
                    { name: '15 Dias', value: '15d' },
                    { name: '30 Dias', value: '30d' },
                    { name: '1 Ano', value: '365d' },
                    { name: 'Permanente (Lifetime)', value: 'lifetime' }
                )),

    async execute(interaction, supabase, ICONS, EMBED_COLORS) {
        await interaction.deferReply({ ephemeral: true });
        
        const appId = interaction.options.getString('app_id');
        const duration = interaction.options.getString('duracao');

        try {
            // Verificar se AppID existe
            const { data: app } = await supabase.from('apps').select('id').eq('app_id', appId).single();
            if (!app) {
                return interaction.editReply({ content: `${ICONS.ERROR} AppID \`${appId}\` não encontrado.` });
            }

            // Gerar Key
            const rawKey = 'KEY-' + crypto.randomBytes(16).toString('hex').toUpperCase();
            const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

            // Calcular Expiração
            const expiresAt = calculateExpiration(duration);

            // Inserir
            const { error } = await supabase.from('licenses').insert([{
                license_key: keyHash,
                app_id: appId,
                expires_at: expiresAt,
                active: true,
                created_at: new Date()
            }]);

            if (error) throw error;

            const durationLabels = {
                '1d': '1 Dia',
                '3d': '3 Dias',
                '7d': '7 Dias',
                '15d': '15 Dias',
                '30d': '30 Dias',
                '365d': '1 Ano',
                'lifetime': 'Lifetime'
            };

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLORS.SUCCESS)
                .setTitle(`${ICONS.SUCCESS} Licença Criada`)
                .setDescription(`⚠️ **Copie a chave abaixo agora! Ela não será mostrada novamente.**`)
                .addFields(
                    { name: '🔑 Key (Copiável)', value: `\`\`\`${rawKey}\`\`\`` },
                    { name: '📦 AppID', value: `\`${appId}\``, inline: true },
                    { name: '⏳ Duração', value: durationLabels[duration] || duration, inline: true },
                    { name: '📅 Expira em', value: expiresAt ? `<t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:f>` : 'Nunca', inline: true }
                )
                .setFooter({ text: 'Armazenado com criptografia SHA-256' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            interaction.editReply({ content: `${ICONS.ERROR} Erro ao criar licença: ${err.message}` });
        }
    },

    async autocomplete(interaction, supabase) {
        const focusedValue = interaction.options.getFocused();
        const { data } = await supabase
            .from('apps')
            .select('app_id, name')
            .ilike('app_id', `%${focusedValue}%`)
            .limit(25); 
            
        if (data) {
            await interaction.respond(
                data.map(app => ({ name: `${app.name ?? app.app_id} (${app.app_id})`, value: app.app_id }))
            );
        } else {
            await interaction.respond([]);
        }
    }
};

function calculateExpiration(duration) {
    if (duration === "lifetime") return null;

    const days = parseInt(duration.replace("d", ""));
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
}
