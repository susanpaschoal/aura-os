const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
require('dotenv').config();

const app = express();

// --- CONFIGURAÇÃO DO BANCO DE DADOS (POSTGRESQL) ---
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

// --- MODELOS (TABELAS) ---
const Empresa = sequelize.define('Empresa', {
    dominio: { type: DataTypes.STRING, unique: true }
});

const Usuario = sequelize.define('Usuario', {
    nome: DataTypes.STRING,
    login: { type: DataTypes.STRING, unique: true },
    senha: DataTypes.STRING,
    assinatura_ativa: { type: DataTypes.INTEGER, defaultValue: 0 }
});

const Estoque = sequelize.define('Estoque', {
    nome: DataTypes.STRING,
    tipo: DataTypes.STRING, // 'Alugado' ou 'Comprado'
    codigo_identificador: DataTypes.STRING,
    quantidade: { type: DataTypes.INTEGER, defaultValue: 0 },
    status: { type: DataTypes.STRING, defaultValue: 'Disponível' }
});

// Relacionamentos
Empresa.hasMany(Usuario);
Usuario.belongsTo(Empresa);
Empresa.hasMany(Estoque);
Estoque.belongsTo(Empresa);

// Sincronizar banco de dados
sequelize.sync();

// --- MIDDLEWARES ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    store: new pgSession({
        conString: process.env.DATABASE_URL,
        tableName: 'session' // O connect-pg-simple criará esta tabela automaticamente
    }),
    secret: 'aura-quantum-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 dias
}));

const auth = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.assinatura_ativa === 0 && req.url !== '/assinatura' && req.url !== '/api/assinar') {
        return res.redirect('/assinatura');
    }
    next();
};

// --- ROTAS DA API ---

// Buscar todos os itens do estoque da empresa do usuário
app.get('/api/dados', auth, async (req, res) => {
    try {
        const dados = await Estoque.findAll({ 
            where: { EmpresaId: req.session.user.EmpresaId },
            order: [['createdAt', 'DESC']]
        });
        res.json(dados);
    } catch (err) { res.status(500).json(err); }
});

// Adicionar novo item ou Incrementar se já existir
app.post('/api/estoque/add', auth, async (req, res) => {
    const { nome, tipo, codigo, qtd } = req.body;
    const EmpresaId = req.session.user.EmpresaId;
    const quantidadeNova = parseInt(qtd) || 0;

    try {
        const [item, created] = await Estoque.findOrCreate({
            where: { codigo_identificador: codigo, EmpresaId: EmpresaId },
            defaults: { nome, tipo, quantidade: quantidadeNova }
        });

        if (!created) {
            item.quantidade += quantidadeNova;
            await item.save();
        }
        res.json({ ok: true, msg: created ? "Criado" : "Incrementado" });
    } catch (err) { res.status(500).json(err); }
});

// Atualizar status (Manutenção/Disponível)
app.post('/api/estoque/status', auth, async (req, res) => {
    try {
        await Estoque.update({ status: req.body.status }, { where: { id: req.body.id, EmpresaId: req.session.user.EmpresaId } });
        res.json({ ok: true });
    } catch (err) { res.status(500).json(err); }
});

// Retirar quantidade (Saída)
app.post('/api/estoque/retirar', auth, async (req, res) => {
    const { id, qtd } = req.body;
    try {
        const item = await Estoque.findOne({ where: { id, EmpresaId: req.session.user.EmpresaId } });
        if (item && item.quantidade >= qtd) {
            item.quantidade -= parseInt(qtd);
            await item.save();
            res.json({ ok: true });
        } else {
            res.status(400).json({ ok: false, error: "Saldo insuficiente" });
        }
    } catch (err) { res.status(500).json(err); }
});

// Deletar item
app.post('/api/estoque/delete', auth, async (req, res) => {
    try {
        await Estoque.destroy({ where: { id: req.body.id, EmpresaId: req.session.user.EmpresaId } });
        res.json({ ok: true });
    } catch (err) { res.status(500).json(err); }
});

// Login
app.post('/api/login', async (req, res) => {
    const { login, senha } = req.body;
    try {
        const user = await Usuario.findOne({ where: { login, senha } });
        if (user) {
            req.session.user = user;
            res.redirect('/');
        } else {
            res.send('<script>alert("Login inválido"); window.location="/login";</script>');
        }
    } catch (err) { res.status(500).send("Erro no servidor"); }
});

// Cadastro de Empresa e Usuário
app.post('/api/cadastro', async (req, res) => {
    const { nome, login, senha } = req.body;
    const dominio = login.split('@')[1] || 'geral';
    try {
        const [empresa] = await Empresa.findOrCreate({ where: { dominio } });
        const novoUsuario = await Usuario.create({ nome, login, senha, EmpresaId: empresa.id });
        res.redirect('/login');
    } catch (err) { res.status(500).send("Erro ao cadastrar"); }
});

// Assinar (Simulação)
app.post('/api/assinar', auth, async (req, res) => {
    try {
        await Usuario.update({ assinatura_ativa: 1 }, { where: { id: req.session.user.id } });
        req.session.user.assinatura_ativa = 1;
        res.json({ ok: true });
    } catch (err) { res.status(500).json(err); }
});

// --- INTERFACE (UI) ---
const ui_header = `
<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;600;700&display=swap" rel="stylesheet">
<style>
    :root { --bg: #05070a; --card: #0f1218; --accent: #38bdf8; --text: #ffffff; --sub: #94a3b8; --danger: #f87171; }
    body { font-family: 'Urbanist', sans-serif; background: var(--bg); color: var(--text); margin:0; display:flex; height:100vh; overflow:hidden; }
    aside { width: 260px; background: #0a0d12; border-right: 1px solid #1e293b; display:flex; flex-direction:column; padding: 20px; }
    .nav-btn { padding: 15px; cursor: pointer; color: var(--sub); border-radius: 8px; margin-bottom: 5px; transition: 0.3s; display:flex; align-items:center; gap:10px; }
    .nav-btn:hover, .nav-btn.active { background: #111827; color: var(--accent); }
    main { flex:1; padding: 40px; overflow-y:auto; position:relative; }
    .stats-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: var(--card); padding: 25px; border-radius: 16px; border: 1px solid #1e293b; position:relative; }
    .table-container { background: var(--card); border-radius: 16px; padding: 20px; border: 1px solid #1e293b; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align:left; color: var(--sub); padding: 12px; font-size: 13px; border-bottom: 1px solid #1e293b; }
    td { padding: 12px; border-bottom: 1px solid #111827; font-size: 14px; }
    .btn-main { background: var(--accent); color: black; font-weight: bold; padding: 10px 20px; border:none; border-radius:8px; cursor:pointer; }
    .btn-outline { background:none; border:1px solid #1e293b; color:white; padding:5px 10px; border-radius:5px; cursor:pointer; font-size:12px; }
    .modal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); justify-content:center; align-items:center; z-index:100; }
    input, select { background: #111827; border: 1px solid #1e293b; color: white; padding: 10px; border-radius: 8px; margin: 5px 0; width: 100%; }
</style>
`;

app.get('/login', (req, res) => {
    res.send(`${ui_header}
    <div style="display:flex; justify-content:center; align-items:center; width:100%">
        <div class="stat-card" style="width:350px">
            <h2 style="text-align:center; color:var(--accent)">Aura OS</h2>
            <form action="/api/login" method="POST">
                <input name="login" placeholder="E-mail" required>
                <input name="senha" type="password" placeholder="Senha" required>
                <button class="btn-main" style="width:100%; margin-top:10px">ENTRAR</button>
            </form>
            <p style="text-align:center; font-size:12px; color:var(--sub); margin-top:15px; cursor:pointer" onclick="document.getElementById('reg').style.display='block'">Cadastrar Empresa</p>
            <div id="reg" style="display:none">
                <form action="/api/cadastro" method="POST">
                    <input name="nome" placeholder="Seu Nome">
                    <input name="login" placeholder="E-mail Corporativo">
                    <input name="senha" type="password" placeholder="Senha">
                    <button class="btn-main" style="width:100%">CADASTRAR</button>
                </form>
            </div>
        </div>
    </div>`);
});

app.get('/assinatura', auth, (req, res) => {
    res.send(`${ui_header}
    <div style="display:flex; justify-content:center; align-items:center; width:100%">
        <div class="stat-card" style="text-align:center">
            <h1>uCore Enterprise</h1>
            <p style="color:var(--sub)">Sua conta está ativa, mas a dashboard requer ativação.</p>
            <button class="btn-main" onclick="fetch('/api/assinar',{method:'POST'}).then(()=>location.href='/')">ATIVAR PAINEL AGORA</button>
        </div>
    </div>`);
});

app.get('/', auth, (req, res) => {
    res.send(`${ui_header}
    <aside>
        <div style="margin-bottom:40px"><h2 style="color:var(--accent)">Aura OS</h2><small style="color:var(--sub)">Empresa: ${req.session.user.login.split('@')[1]}</small></div>
        <div class="nav-btn active" onclick="changeTab('dash', this)">📊 Dashboard</div>
        <div class="nav-btn" onclick="changeTab('equip', this)">📦 Inventário</div>
        <div class="nav-btn" onclick="changeTab('manu', this)">🔧 Manutenção</div>
        <div class="nav-btn" style="margin-top:auto" onclick="location.href='/logout'">🚪 Sair</div>
    </aside>
    <main id="view"></main>

    <div id="modalAdd" class="modal">
        <div class="stat-card" style="width:400px">
            <h3>Entrada de Material</h3>
            <input id="inNome" placeholder="Nome do Item (Ex: Teclado Dell)">
            <select id="inTipo">
                <option value="Comprado">Consumível (Estoque)</option>
                <option value="Alugado">Ativo (Patrimônio)</option>
            </select>
            <input id="inCod" placeholder="Código SKU ou Patrimônio">
            <input id="inQtd" type="number" placeholder="Quantidade">
            <button class="btn-main" style="width:100%" onclick="saveItem()">CONFIRMAR ENTRADA</button>
            <button onclick="document.getElementById('modalAdd').style.display='none'" style="border:none; background:none; color:var(--sub); width:100%; margin-top:10px; cursor:pointer">Cancelar</button>
        </div>
    </div>

    <script>
        let currentData = [];

        async function refresh() {
            const res = await fetch('/api/dados');
            currentData = await res.json();
            const activeTab = document.querySelector('.nav-btn.active').innerText;
            if(activeTab.includes('Dashboard')) renderDash();
            else if(activeTab.includes('Inventário')) renderEquip();
            else if(activeTab.includes('Manutenção')) renderManu();
        }

        function changeTab(tab, el) {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
            if(tab === 'dash') renderDash();
            if(tab === 'equip') renderEquip();
            if(tab === 'manu') renderManu();
        }

        function renderDash() {
            const alug = currentData.filter(i => i.tipo === 'Alugado').length;
            const comp = currentData.filter(i => i.tipo === 'Comprado').reduce((a,b)=> a+b.quantidade, 0);
            const manu = currentData.filter(i => i.status === 'Manutenção').length;

            document.getElementById('view').innerHTML = \`
                <h1>Visão Geral</h1>
                <div class="stats-grid">
                    <div class="stat-card"><h4>ATV. PATRIMONIAIS</h4><h2>\${alug}</h2></div>
                    <div class="stat-card"><h4>UNIDADES EM ESTOQUE</h4><h2>\${comp}</h2></div>
                    <div class="stat-card"><h4>EM MANUTENÇÃO</h4><h2>\${manu}</h2></div>
                </div>
                <div class="table-container">
                    <h3>Últimas Movimentações</h3>
                    <table>
                        <tr><th>Código</th><th>Item</th><th>Tipo</th><th>Status</th></tr>
                        \${currentData.slice(0,5).map(i => \`<tr><td>#\${i.codigo_identificador}</td><td>\${i.nome}</td><td>\${i.tipo}</td><td>\${i.status}</td></tr>\`).join('')}
                    </table>
                </div>\`;
        }

        function renderEquip() {
            document.getElementById('view').innerHTML = \`
                <div style="display:flex; justify-content:space-between; align-items:center">
                    <h1>Inventário</h1>
                    <button class="btn-main" onclick="document.getElementById('modalAdd').style.display='flex'">+ NOVA ENTRADA</button>
                </div>
                <div class="table-container">
                    <table>
                        <tr><th>Cód/SKU</th><th>Item</th><th>Tipo</th><th>Saldo/Status</th><th>Ações</th></tr>
                        \${currentData.map(i => \`<tr>
                            <td>\${i.codigo_identificador}</td>
                            <td>\${i.nome}</td>
                            <td>\${i.tipo}</td>
                            <td>\${i.tipo === 'Alugado' ? i.status : i.quantidade + ' un'}</td>
                            <td>
                                \${i.tipo === 'Comprado' ? \`<button class="btn-outline" onclick="retirar('\${i.id}')">Dar Saída</button>\` : ''}
                                <button class="btn-outline" style="color:var(--danger)" onclick="deleteItem('\${i.id}')">Excluir</button>
                            </td>
                        </tr>\`).join('')}
                    </table>
                </div>\`;
        }

        function renderManu() {
            const emManu = currentData.filter(i => i.tipo === 'Alugado');
            document.getElementById('view').innerHTML = \`
                <h1>Manutenção de Ativos</h1>
                <div class="table-container">
                    <table>
                        <tr><th>Patrimônio</th><th>Item</th><th>Status</th><th>Ações</th></tr>
                        \${emManu.map(i => \`<tr>
                            <td>\${i.codigo_identificador}</td>
                            <td>\${i.nome}</td>
                            <td style="color:\${i.status === 'Manutenção' ? 'var(--danger)' : 'var(--accent)'}">\${i.status}</td>
                            <td>
                                <button class="btn-outline" onclick="setStatus('\${i.id}', 'Manutenção')">🔧 Reparar</button>
                                <button class="btn-outline" onclick="setStatus('\${i.id}', 'Disponível')">✅ Liberar</button>
                            </td>
                        </tr>\`).join('')}
                    </table>
                </div>\`;
        }

        async function saveItem() {
            const body = { 
                nome: document.getElementById('inNome').value, 
                tipo: document.getElementById('inTipo').value, 
                codigo: document.getElementById('inCod').value, 
                qtd: document.getElementById('inQtd').value 
            };
            await fetch('/api/estoque/add', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
            document.getElementById('modalAdd').style.display='none';
            refresh();
        }

        async function retirar(id) {
            const qtd = prompt("Quantidade para saída:");
            if(qtd) {
                const res = await fetch('/api/estoque/retirar', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, qtd}) });
                if(!res.ok) alert("Saldo insuficiente!");
                refresh();
            }
        }

        async function deleteItem(id) {
            if(confirm("Excluir item?")) {
                await fetch('/api/estoque/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id}) });
                refresh();
            }
        }

        async function setStatus(id, s) {
            await fetch('/api/estoque/status', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, status:s}) });
            refresh();
        }

        refresh();
    </script>`);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor Aura rodando na porta ' + PORT));
