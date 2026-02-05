const { EmbedBuilder } = require('discord.js');
const supabase = require('../utils/supabaseClient');

async function sendSystemStatus(client, localCommandCount) {
    const statusChannelId = process.env.STATUS_CHANNEL_ID;
    
    // Se não tiver canal configurado, apenas loga e sai (sem erro)
    if (!statusChannelId) {
        console.log('ℹ️ STATUS_CHANNEL_ID não configurado. Pulei o envio do status.');
        return;
    }

    const channel = client.channels.cache.get(statusChannelId);
    if (!channel) {
        console.error(`❌ Canal de status ${statusChannelId} não encontrado no cache do bot.`);
        return;
    }

    try {
        // 1. Coletar dados do Supabase
        const { count: userCount } = await supabase.from('licenses').select('*', { count: 'exact', head: true });
        const { count: appCount } = await supabase.from('apps').select('*', { count: 'exact', head: true });
        const { count: activeAppCount } = await supabase.from('apps').select('*', { count: 'exact', head: true }).eq('active', true);
        
        // Manutenção = Total Apps - Apps Ativos (suposição lógica)
        const maintenanceCount = (appCount || 0) - (activeAppCount || 0);

        // 2. Status da API
        let apiStatus = 'Offline 🔴';
        let apiPing = 0;
        try {
            const start = Date.now();
            // Tenta pingar a API (usa fetch global do Node 18+)
            const res = await fetch(`${process.env.API_URL || 'http://localhost:3000'}/health`);
            if (res.ok) {
                apiStatus = 'Online 🟢';
                apiPing = Date.now() - start;
            }
        } catch (e) {
            // API Offline ou erro de conexão
        }

        // 3. Status do Banco
        let dbStatus = 'Offline 🔴';
        const { error } = await supabase.from('apps').select('id').limit(1);
        if (!error) dbStatus = 'Online 🟢';

        // 4. Dados do Sistema
        const memoryUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
        const uptime = formatUptime(process.uptime());
        const botPing = client.ws.ping;
        
        // Comandos registrados (pode ser obtido do cache da aplicação ou passado como arg, mas aqui pegamos do cache global se disponível)
        // Se a cache estiver vazia, tentamos pegar o tamanho da cache de comandos do client (se tiver sido populada)
        // ou fazemos um fetch rápido se necessário, mas para evitar rate limit, usamos o que temos.
        const commandCount = localCommandCount || client.application?.commands.cache.size || 0;

        // 5. Montar Embed
        const isAllOnline = apiStatus.includes('Online') && dbStatus.includes('Online');
        const color = isAllOnline ? 0x00FF00 : 0xFF0000; // Verde ou Vermelho

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('📊 Status do Sistema')
            .setDescription('Monitoramento em tempo real dos serviços.')
            .addFields(
                { name: '👥 Estatísticas', value: `**Usuários:** ${userCount || 0}\n**Apps:** ${appCount || 0}\n**Ativos:** ${activeAppCount || 0}\n**Manutenção:** ${maintenanceCount || 0}`, inline: true },
                { name: '⚙️ Sistema', value: `**Uptime:** ${uptime}\n**Memória:** ${memoryUsage} MB\n**Ping Bot:** ${botPing}ms\n**Comandos:** ${commandCount}`, inline: true },
                { name: '📡 Serviços', value: `**API:** ${apiStatus} (${apiPing}ms)\n**Database:** ${dbStatus}`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'Atualizado automaticamente a cada 24h' });

        // 6. Enviar
        await channel.send({ embeds: [embed] });
        console.log(`✅ Status do sistema enviado para #${channel.name}`);

    } catch (err) {
        console.error('❌ Erro ao enviar status do sistema:', err);
    }
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    
    const parts = [];
    if(d > 0) parts.push(`${d}d`);
    if(h > 0) parts.push(`${h}h`);
    if(m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.length > 0 ? parts.join(' ') : '0s';
}

module.exports = sendSystemStatus;
