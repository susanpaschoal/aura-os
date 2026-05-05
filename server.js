const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
require('dotenv').config();

const app = express();

// --- CONEXÃO NEON (POSTGRESQL) ---
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    },
    logging: false
});

// --- MODELOS DE DADOS ---
const Empresa = sequelize.define('Empresa', { dominio: { type: DataTypes.STRING, unique: true } });
const Usuario = sequelize.define('Usuario', {
    nome: DataTypes.STRING,
    login: { type: DataTypes.STRING, unique: true },
    senha: DataTypes.STRING,
    assinatura_ativa: { type: DataTypes.INTEGER, defaultValue: 1 } // Ativo por padrão
});
const Estoque = sequelize.define('Estoque', {
    nome: DataTypes.STRING,
    tipo: DataTypes.STRING, // 'Alugado' (Ativo) ou 'Comprado' (Consumível)
    codigo_identificador: DataTypes.STRING,
    quantidade: { type: DataTypes.INTEGER, defaultValue: 0 },
    status: { type: DataTypes.STRING, defaultValue: 'Disponível' }
});

Empresa.hasMany(Usuario);
Usuario.belongsTo(Empresa);
Empresa.hasMany(Estoque);
Estoque.belongsTo(Empresa);

// Sincronização automática com o Neon
sequelize.sync({ alter: true });

// --- MIDDLEWARES E SESSÃO ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    store: new pgSession({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true
    }),
    secret: 'aura-quantum-enterprise-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, secure: false }
}));

const auth = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    next();
};

// --- ROTAS DA API ---

app.get('/api/dados', auth, async (req, res) => {
    try {
        const dados = await Estoque.findAll({ 
            where: { EmpresaId: req.session.user.EmpresaId },
            order: [['createdAt', 'DESC']]
        });
        res.json(dados);
    } catch (err) { res.status(500).json(err); }
});

app.post('/api/estoque/add', auth, async (req, res) => {
    const { nome, tipo, codigo, qtd } = req.body;
    try {
        const [item, created] = await Estoque.findOrCreate({
            where: { codigo_identificador: codigo, EmpresaId: req.session.user.EmpresaId },
            defaults: { nome, tipo, quantidade: parseInt(qtd) || 0 }
        });
        if (!created) {
            item.quantidade += parseInt(qtd) || 0;
            await item.save();
        }
        res.json({ ok: true });
    } catch (err) { res.status(500).json(err); }
});

app.post('/api/estoque/status', auth, async (req, res) => {
    await Estoque.update({ status: req.body.status }, { 
        where: { id: req.body.id, EmpresaId: req.session.user.EmpresaId } 
    });
    res.json({ ok: true });
});

app.post('/api/estoque/retirar', auth, async (req, res) => {
    const { id, qtd } = req.body;
    const item = await Estoque.findOne({ where: { id, EmpresaId: req.session.user.EmpresaId } });
    if (item && item.quantidade >= qtd) {
        item.quantidade -= parseInt(qtd);
        await item.save();
        res.json({ ok: true });
    } else {
        res.status(400).json({ error: "Saldo insuficiente" });
    }
});

app.post('/api/login', async (req, res) => {
    const { login, senha } = req.body;
    const user = await Usuario.findOne({ where: { login, senha } });
    if (user) {
        req.session.user = user;
        req.session.save(() => res.redirect('/'));
    } else {
        res.send('<script>alert("Falha no login"); window.location="/login";</script>');
    }
});

app.post('/api/cadastro', async (req, res) => {
    const { nome, login, senha } = req.body;
    const dominio = login.split('@')[1] || 'comum';
    const [empresa] = await Empresa.findOrCreate({ where: { dominio } });
    await Usuario.create({ nome, login, senha, EmpresaId: empresa.id });
    res.redirect('/login');
});

// --- INTERFACE (UI ÚNICA) ---
const ui_header = `
<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;600;700&display=swap" rel="stylesheet">
<style>
    :root { --bg: #05070a; --card: #0f1218; --accent: #38bdf8; --text: #ffffff; --sub: #94a3b8; --danger: #f87171; }
    body { font-family: 'Urbanist', sans-serif; background: var(--bg); color: var(--text); margin:0; display:flex; height:100vh; overflow:hidden; }
    aside { width: 260px; background: #0a0d12; border-right: 1px solid #1e293b; display:flex; flex-direction:column; padding: 20px; }
    .nav-btn { padding: 15px; cursor: pointer; color: var(--sub); border-radius: 8px; margin-bottom: 5px; transition: 0.3s; display:flex; align-items:center; gap:10px; }
    .nav-btn:hover, .nav-btn.active { background: #111827; color: var(--accent); font-weight:bold; }
    main { flex:1; padding: 40px; overflow-y:auto; }
    .stats-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: var(--card); padding: 25px; border-radius: 16px; border: 1px solid #1e293b; }
    .table-container { background: var(--card); border-radius: 16px; padding: 20px; border: 1px solid #1e293b; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align:left; color: var(--sub); padding: 12px; border-bottom: 1px solid #1e293b; font-size: 13px; }
    td { padding: 12px; border-bottom: 1px solid #111827; font-size: 14px; }
    .btn-main { background: var(--accent); color: black; font-weight: bold; padding: 10px 20px; border:none; border-radius:8px; cursor:pointer; }
    .btn-outline { background:none; border:1px solid #1e293b; color:white; padding:5px 10px; border-radius:5px; cursor:pointer; }
    input, select { background: #111827; border: 1px solid #1e293b; color: white; padding: 10px; border-radius: 8px; margin: 5px 0; }
</style>
`;

app.get('/login', (req, res) => {
    res.send(`${ui_header}
    <div style="display:flex; justify-content:center; align-items:center; width:100%">
        <div class="stat-card" style="width:350px">
            <h2 style="text-align:center; color:var(--accent)">Aura OS</h2>
            <form action="/api/login" method="POST">
                <input name="login" placeholder="E-mail" style="width:93%" required>
                <input name="senha" type="password" placeholder="Senha" style="width:93%" required>
                <button class="btn-main" style="width:100%; margin-top:15px">ENTRAR NO SISTEMA</button>
            </form>
            <hr style="border:0; border-top:1px solid #1e293b; margin:20px 0">
            <form action="/api/cadastro" method="POST">
                <p style="font-size:12px; color:var(--sub)">Novo aqui? Registre sua empresa:</p>
                <input name="nome" placeholder="Seu Nome" style="width:93%">
                <input name="login" placeholder="E-mail Profissional" style="width:93%">
                <input name="senha" type="password" placeholder="Senha" style="width:93%">
                <button class="btn-outline" style="width:100%">CRIAR CONTA</button>
            </form>
        </div>
    </div>`);
});

app.get('/', auth, (req, res) => {
    res.send(`${ui_header}
    <aside>
        <div style="margin-bottom:40px"><h2 style="color:var(--accent)">Aura OS</h2></div>
        <div class="nav-btn active" onclick="changeTab('dash', this)">📊 Dashboard</div>
        <div class="nav-btn" onclick="changeTab('equip', this)">📦 Inventário</div>
        <div class="nav-btn" onclick="changeTab('manu', this)">🔧 Manutenção</div>
        <div class="nav-btn" style="margin-top:auto" onclick="location.href='/logout'">🚪 Sair</div>
    </aside>
    <main id="view"></main>

    <script>
        let currentData = [];
        async function refresh() {
            const res = await fetch('/api/dados');
            currentData = await res.json();
            const active = document.querySelector('.nav-btn.active').innerText;
            if(active.includes('Dashboard')) renderDash();
            else if(active.includes('Inventário')) renderEquip();
            else renderManu();
        }

        function changeTab(tab, el) {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
            refresh();
        }

        function renderDash() {
            const alug = currentData.filter(i => i.tipo === 'Alugado').length;
            const comp = currentData.filter(i => i.tipo === 'Comprado').reduce((a,b)=> a + b.quantidade, 0);
            const manu = currentData.filter(i => i.status === 'Manutenção').length;
            
            document.getElementById('view').innerHTML = \`
                <h1>Visão Geral</h1>
                <div class="stats-grid">
                    <div class="stat-card"><h4>ATV. PATRIMONIAIS</h4><h2>\${alug}</h2></div>
                    <div class="stat-card"><h4>ITENS EM ESTOQUE</h4><h2>\${comp}</h2></div>
                    <div class="stat-card"><h4>EM MANUTENÇÃO</h4><h2>\${manu}</h2></div>
                </div>
                <div class="table-container">
                    <h3>Últimas Movimentações</h3>
                    <table>
                        <tr><th>Código</th><th>Item</th><th>Tipo</th><th>Status</th></tr>
                        \${currentData.slice(0,5).map(i => \`<tr><td>\${i.codigo_identificador}</td><td>\${i.nome}</td><td>\${i.tipo}</td><td>\${i.status}</td></tr>\`).join('')}
                    </table>
                </div>\`;
        }

        function renderEquip() {
            document.getElementById('view').innerHTML = \`
                <h1>Inventário & Entradas</h1>
                <div class="stat-card" style="margin-bottom:20px">
                    <input id="n" placeholder="Nome do Item">
                    <select id="t"><option value="Comprado">Estoque (Consumível)</option><option value="Alugado">Ativo (Patrimônio)</option></select>
                    <input id="c" placeholder="Código/Patrimônio">
                    <input id="q" type="number" placeholder="Qtd" style="width:60px">
                    <button class="btn-main" onclick="add()">CADASTRAR</button>
                </div>
                <div class="table-container">
                    <table>
                        <tr><th>Código</th><th>Item</th><th>Tipo</th><th>Saldo/Status</th><th>Ações</th></tr>
                        \${currentData.map(i => \`<tr>
                            <td>\${i.codigo_identificador}</td><td>\${i.nome}</td><td>\${i.tipo}</td>
                            <td>\${i.tipo === 'Comprado' ? i.quantidade + ' un' : i.status}</td>
                            <td>\${i.tipo === 'Comprado' ? \`<button class="btn-outline" onclick="out('\${i.id}')">Saída</button>\` : '-'}</td>
                        </tr>\`).join('')}
                    </table>
                </div>\`;
        }

        function renderManu() {
            const ativos = currentData.filter(i => i.tipo === 'Alugado');
            document.getElementById('view').innerHTML = \`
                <h1>Gestão de Manutenção</h1>
                <div class="table-container">
                    <table>
                        <tr><th>Patrimônio</th><th>Item</th><th>Status Atual</th><th>Ações</th></tr>
                        \${ativos.map(i => \`<tr>
                            <td>\${i.codigo_identificador}</td><td>\${i.nome}</td>
                            <td style="color:\${i.status === 'Manutenção' ? 'var(--danger)' : 'var(--accent)'}">\${i.status}</td>
                            <td>
                                <button class="btn-outline" onclick="setStatus('\${i.id}','Manutenção')">🔧 Reparar</button>
                                <button class="btn-outline" onclick="setStatus('\${i.id}','Disponível')">✅ Liberar</button>
                            </td>
                        </tr>\`).join('')}
                    </table>
                </div>\`;
        }

        async function add() {
            const body = { nome: document.getElementById('n').value, tipo: document.getElementById('t').value, codigo: document.getElementById('c').value, qtd: document.getElementById('q').value };
            await fetch('/api/estoque/add', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
            refresh();
        }

        async function out(id) {
            const qtd = prompt("Quantidade de saída:");
            if(qtd) await fetch('/api/estoque/retirar', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, qtd}) });
            refresh();
        }

        async function setStatus(id, status) {
            await fetch('/api/estoque/status', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, status}) });
            refresh();
        }

        refresh();
    </script>`);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Aura Enterprise Ativa'));
