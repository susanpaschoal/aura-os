const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
require('dotenv').config();

const app = express();

// Configuração do Sequelize (PostgreSQL)
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    logging: false
});

// Modelos
const Empresa = sequelize.define('Empresa', { dominio: { type: DataTypes.STRING, unique: true } });
const Usuario = sequelize.define('Usuario', {
    nome: DataTypes.STRING,
    login: { type: DataTypes.STRING, unique: true },
    senha: DataTypes.STRING,
    assinatura_ativa: { type: DataTypes.INTEGER, defaultValue: 0 }
});
const Estoque = sequelize.define('Estoque', {
    nome: DataTypes.STRING,
    tipo: DataTypes.STRING,
    codigo_identificador: DataTypes.STRING,
    quantidade: { type: DataTypes.INTEGER, defaultValue: 0 },
    status: { type: DataTypes.STRING, defaultValue: 'Disponível' }
});

// Relacionamentos
Empresa.hasMany(Usuario);
Usuario.belongsTo(Empresa);
Empresa.hasMany(Estoque);
Estoque.belongsTo(Empresa);

sequelize.sync();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    store: new pgSession({ conString: process.env.DATABASE_URL }),
    secret: 'aura-quantum-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

const auth = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.assinatura_ativa === 0 && req.url !== '/assinatura' && req.url !== '/api/assinar') return res.redirect('/assinatura');
    next();
};

// --- API ---
app.get('/api/dados', auth, async (req, res) => {
    const dados = await Estoque.findAll({ where: { EmpresaId: req.session.user.EmpresaId } });
    res.json(dados);
});

app.post('/api/estoque/add', auth, async (req, res) => {
    const { nome, tipo, codigo, qtd } = req.body;
    const EmpresaId = req.session.user.EmpresaId;
    const quantidadeNova = parseInt(qtd) || 0;

    const [item, created] = await Estoque.findOrCreate({
        where: { codigo_identificador: codigo, EmpresaId },
        defaults: { nome, tipo, quantidade: quantidadeNova }
    });

    if (!created) {
        item.quantidade += quantidadeNova;
        await item.save();
    }
    res.json({ ok: true });
});

app.post('/api/estoque/retirar', auth, async (req, res) => {
    const { id, qtd } = req.body;
    const item = await Estoque.findByPk(id);
    if (item && item.quantidade >= qtd) {
        item.quantidade -= qtd;
        await item.save();
        return res.json({ ok: true });
    }
    res.status(400).json({ ok: false });
});

app.post('/api/login', async (req, res) => {
    const { login, senha } = req.body;
    const user = await Usuario.findOne({ where: { login, senha } });
    if (user) { req.session.user = user; res.redirect('/'); }
    else res.send('<script>alert("Erro"); window.location="/login";</script>');
});

app.post('/api/cadastro', async (req, res) => {
    const { nome, login, senha } = req.body;
    const dominio = login.split('@')[1] || 'geral';
    const [empresa] = await Empresa.findOrCreate({ where: { dominio } });
    await Usuario.create({ nome, login, senha, EmpresaId: empresa.id });
    res.redirect('/login');
});

// (O restante do código de UI e rotas de status/delete segue a mesma lógica anterior)
// ...
app.listen(process.env.PORT || 3000, () => console.log('Aura Online'));
