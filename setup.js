const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const usersDbPath = path.join(dataDir, 'users.sqlite');
const usersDb = new sqlite3.Database(usersDbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados de usuários:', err.message);
    } else {
        console.log('Conexão com o banco de dados de usuários estabelecida.');
    }
});

const appidsDbPath = path.join(dataDir, 'appids.sqlite');
const appidsDb = new sqlite3.Database(appidsDbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados de appids:', err.message);
    } else {
        console.log('Conexão com o banco de dados de appids estabelecida.');
    }
});

// Criação da tabela de appids
appidsDb.serialize(() => {
    appidsDb.run(`
        CREATE TABLE IF NOT EXISTS app_ids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_id VARCHAR(50) UNIQUE NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            in_maintenance BOOLEAN DEFAULT FALSE,
            last_config_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `, (err) => {
        if (err) {
            console.error('Erro ao criar a tabela app_ids:', err.message);
        } else {
            console.log('Tabela app_ids criada ou já existente.');
        }
    });
});

// Criação da tabela de usuários
usersDb.serialize(() => {
    usersDb.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id VARCHAR(50) UNIQUE NOT NULL,
            hwid VARCHAR(255) UNIQUE,
            last_known_ip VARCHAR(50),
            role VARCHAR(20) NOT NULL,
            expiration_date TIMESTAMP,
            last_login_date TIMESTAMP,
            app_id_fk INTEGER NOT NULL,
            avatar_url VARCHAR(255),
            FOREIGN KEY (app_id_fk) REFERENCES app_ids(id) ON DELETE CASCADE
        );
    `, (err) => {
        if (err) {
            console.error('Erro ao criar a tabela users:', err.message);
        } else {
            console.log('Tabela users criada ou já existente.');
        }
    });
});

// Fecha as conexões
usersDb.close();
appidsDb.close();