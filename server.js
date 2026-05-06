require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const session = require('express-session');
const app = express();

// --- 1. CONEXÃO COM O BANCO (NEON) ---
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
        ssl: { require: true, rejectUnauthorized: false }
    },
    logging: false
});

// --- 2. MODELOS ---
const Empresa = sequelize.define('Empresa', {
    dominio: { type: DataTypes.STRING, unique: true }
}, { tableName: 'empresas', timestamps: false });

const Usuario = sequelize.define('Usuario', {
    nome: { type: DataTypes.STRING },
    login: { type: DataTypes.STRING, unique: true },
    senha: { type: DataTypes.STRING },
    empresa_id: { type: DataTypes.INTEGER }
}, { tableName: 'usuarios', timestamps: false });

const Estoque = sequelize.define('Estoque', {
    nome: { type: DataTypes.STRING },
    quantidade: { type: DataTypes.INTEGER, defaultValue: 0 },
    empresa_id: { type: DataTypes.INTEGER }
}, { tableName: 'estoque', timestamps: false });

// --- 3. MIDDLEWARES ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'aura-secret-2026',
    resave: false,
    saveUninitialized: false
}));

// Middleware de Autenticação
const auth = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    next();
};

// --- 4. FRONT-END (HTML/CSS EM BUTIDO) ---

const layout = (conteudo) => `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aura OS - InnovatiHub</title>
    <style>
        :root { --primary: #00d4ff; --bg: #0f172a; --card: #1e293b; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: white; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: auto; }
        .card { background: var(--card); padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); margin-bottom: 20px; }
        input { width: 100%; padding: 10px; margin: 10px 0; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: white; box-sizing: border-box; }
        button { background: var(--primary); color: #000; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
        .nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
    </style>
</head>
<body>
    <div class="container">${conteudo}</div>
</body>
</html>
`;

// --- 5. ROTAS ---

// Página de Login
app.get('/login', (req, res) => {
    res.send(layout(`
        <div class="card">
            <h2>Aura OS - Login</h2>
            <form action="/api/login" method="POST">
                <input name="login" placeholder="Usuário" required>
                <input name="senha" type="password" placeholder="Senha" required>
                <button type="submit">Entrar no Sistema</button>
            </form>
        </div>
    `));
});

// API de Login
app.post('/api/login', async (req, res) => {
    const { login, senha } = req.body;
    const user = await Usuario.findOne({ where: { login, senha } });
    if (user) {
        req.session.user = user;
        return res.redirect('/dashboard');
    }
    res.send("<script>alert('Falha no login'); window.location='/login';</script>");
});

// Dashboard (Estoque)
app.get('/dashboard', auth, async (req, res) => {
    const itens = await Estoque.findAll({ where: { empresa_id: req.session.user.empresa_id } });
    
    let tabela = itens.map(i => `<tr><td>${i.nome}</td><td>${i.quantidade}</td></tr>`).join('');
    
    res.send(layout(`
        <div class="nav">
            <h1>📦 Estoque Aura</h1>
            <a href="/logout" style="color: #ff4d4d;">Sair</a>
        </div>
        <div class="card">
            <h3>Adicionar Item</h3>
            <form action="/api/estoque/add" method="POST" style="display: flex; gap: 10px;">
                <input name="nome" placeholder="Nome do item" required>
                <input name="quantidade" type="number" placeholder="Qtd" required style="width: 80px;">
                <button type="submit" style="width: auto;">+</button>
            </form>
        </div>
        <div class="card">
            <table>
                <thead><tr><th>Item</th><th>Quantidade</th></tr></thead>
                <tbody>${tabela || '<tr><td colspan="2">Nenhum item cadastrado.</td></tr>'}</tbody>
            </table>
        </div>
    `));
});

// API Adicionar Estoque
app.post('/api/estoque/add', auth, async (req, res) => {
    await Estoque.create({
        nome: req.body.nome,
        quantidade: req.body.quantidade,
        empresa_id: req.session.user.empresa_id
    });
    res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Rota raiz
app.get('/', (req, res) => res.redirect('/dashboard'));

// --- 6. INICIALIZAÇÃO ---
async function start() {
    try {
        await sequelize.authenticate();
        await sequelize.sync(); 
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, '0.0.0.0', () => console.log(`Aura OS ON: ${PORT}`));
    } catch (e) {
        console.error("Erro ao subir:", e);
    }
}

start();
