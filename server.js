require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const session = require('express-session');
const app = express();

// --- CONFIGURAÇÃO DO BANCO DE DADOS (CONEXÃO NEON) ---
const dbUrl = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_xgH6hJ0ZuWbi@ep-tiny-dream-ac0e0tad-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require';

const sequelize = new Sequelize(dbUrl, {
    dialect: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    },
    logging: false
});

// --- MODELOS ---
const Empresa = sequelize.define('Empresa', {
    dominio: { type: DataTypes.STRING, unique: true }
}, { tableName: 'empresas', timestamps: false });

const Usuario = sequelize.define('Usuario', {
    nome: { type: DataTypes.STRING },
    login: { type: DataTypes.STRING, unique: true },
    senha: { type: DataTypes.STRING },
    assinatura_ativa: { type: DataTypes.INTEGER, defaultValue: 1 }, // Ativo por padrão para teste
    empresa_id: { type: DataTypes.INTEGER }
}, { tableName: 'usuarios', timestamps: false });

const Estoque = sequelize.define('Estoque', {
    nome: { type: DataTypes.STRING },
    tipo: { type: DataTypes.STRING }, // 'Alugado' ou 'Comprado'
    codigo_identificador: { type: DataTypes.STRING },
    quantidade: { type: DataTypes.INTEGER, defaultValue: 0 },
    status: { type: DataTypes.STRING, defaultValue: 'Disponível' },
    responsavel: { type: DataTypes.STRING, defaultValue: 'Estoque' }, // Quem está com o item ou quem retirou
    equipe: { type: DataTypes.STRING, defaultValue: 'Geral' },         // Setor do funcionário
    empresa_id: { type: DataTypes.INTEGER }
}, { tableName: 'estoque', timestamps: false });

// Sincronizar Banco
sequelize.sync().then(() => console.log('✅ Banco sincronizado com Neon'));

// --- MIDDLEWARES ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ 
    secret: 'aura-quantum-2026', 
    resave: false, 
    saveUninitialized: false 
}));

const auth = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    next();
};

// --- API ROUTES ---
app.get('/api/dados', auth, async (req, res) => {
    const itens = await Estoque.findAll({ 
        where: { empresa_id: req.session.user.empresa_id },
        order: [['id', 'DESC']]
    });
    res.json(itens);
});

app.post('/api/login', async (req, res) => {
    const { login, senha } = req.body;
    const user = await Usuario.findOne({ where: { login, senha } });
    if (user) { 
        req.session.user = user.toJSON(); 
        res.redirect('/'); 
    } else {
        res.send('<script>alert("Acesso Negado"); window.location="/login";</script>');
    }
});

app.post('/api/cadastro', async (req, res) => {
    const { nome, login, senha } = req.body;
    const dominio = login.split('@')[1] || 'geral';
    const [empresa] = await Empresa.findOrCreate({ where: { dominio } });
    await Usuario.create({ nome, login, senha, empresa_id: empresa.id });
    res.redirect('/login');
});

app.post('/api/estoque/add', auth, async (req, res) => {
    const { nome, tipo, codigo, qtd, responsavel, equipe } = req.body;
    const empresa_id = req.session.user.empresa_id;

    if (tipo === 'Alugado') {
        // Alugados são registros únicos para saber com quem está cada um
        await Estoque.create({ 
            nome, tipo, codigo_identificador: codigo, 
            quantidade: 1, responsavel, equipe, empresa_id 
        });
    } else {
        // Comprados somam quantidade
        const [item, created] = await Estoque.findOrCreate({
            where: { codigo_identificador: codigo, empresa_id, tipo: 'Comprado' },
            defaults: { nome, tipo, quantidade: qtd, empresa_id, responsavel: 'Estoque' }
        });
        if (!created) await item.increment('quantidade', { by: parseInt(qtd) });
    }
    res.json({ ok: true });
});

app.post('/api/estoque/retirar', auth, async (req, res) => {
    const { id, qtd, responsavel, equipe } = req.body;
    const item = await Estoque.findOne({ where: { id, empresa_id: req.session.user.empresa_id } });

    if (item && item.quantidade >= parseInt(qtd)) {
        await item.decrement('quantidade', { by: parseInt(qtd) });
        await item.update({ responsavel, equipe }); // Salva quem fez a última retirada
        res.json({ ok: true });
    } else {
        res.status(400).json({ error: "Saldo insuficiente" });
    }
});

app.post('/api/estoque/status', auth, async (req, res) => {
    await Estoque.update({ status: req.body.status }, { where: { id: req.body.id, empresa_id: req.session.user.empresa_id } });
    res.json({ ok: true });
});

app.post('/api/estoque/delete', auth, async (req, res) => {
    await Estoque.destroy({ where: { id: req.body.id, empresa_id: req.session.user.empresa_id } });
    res.json({ ok: true });
});

// --- UI ENGINE (MOBILE ADAPTIVE) ---
const ui_styles = `
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;600;700&display=swap" rel="stylesheet">
<style>
    :root { --bg: #05070a; --card: #0f1218; --accent: #38bdf8; --text: #ffffff; --sub: #94a3b8; --danger: #f87171; --success: #10b981; }
    body { font-family: 'Urbanist', sans-serif; background: var(--bg); color: var(--text); margin:0; display:flex; height:100vh; flex-direction: row; }
    
    /* Mobile Layout Adjustment */
    @media (max-width: 768px) {
        body { flex-direction: column; overflow-y: auto; }
        aside { width: 100% !important; height: auto !important; border-right: none !important; border-bottom: 1px solid #1e293b; padding: 15px !important; }
        main { padding: 15px !important; }
        .stats-grid { grid-template-columns: 1fr !important; }
        .table-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        table { min-width: 700px; }
        .modal-content { width: 90% !important; }
    }

    aside { width: 260px; background: #0a0d12; border-right: 1px solid #1e293b; display:flex; flex-direction:column; padding: 20px; flex-shrink:0; }
    .nav-btn { padding: 14px; cursor: pointer; color: var(--sub); border-radius: 12px; margin-bottom: 8px; transition: 0.2s; display:flex; align-items:center; gap:12px; font-weight: 500; }
    .nav-btn.active { background: #111827; color: var(--accent); }
    
    main { flex:1; padding: 40px; overflow-y:auto; }
    .stats-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px; }
    .stat-card { background: var(--card); padding: 20px; border-radius: 16px; border: 1px solid #1e293b; }
    
    .table-container { background: var(--card); border-radius: 16px; border: 1px solid #1e293b; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align:left; color: var(--sub); padding: 15px; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #1e293b; }
    td { padding: 15px; border-bottom: 1px solid #111827; font-size: 13px; }

    .btn-main { background: var(--accent); color: black; font-weight: 700; padding: 12px 20px; border:none; border-radius:10px; cursor:pointer; width: 100%; }
    .btn-outline { background:none; border:1px solid #1e293b; color:white; padding:6px 10px; border-radius:8px; cursor:pointer; font-size:11px; }
    
    .modal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); justify-content:center; align-items:center; z-index:100; backdrop-filter: blur(5px); }
    .modal-content { background: var(--card); padding: 25px; border-radius: 20px; width: 400px; border: 1px solid var(--accent); }
    input, select { background: #111827; border: 1px solid #1e293b; color: white; padding: 12px; border-radius: 10px; margin: 8px 0; width: 100%; box-sizing: border-box; }
    .badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; background: rgba(56, 189, 248, 0.15); color: var(--accent); }
</style>
`;

app.get('/login', (req, res) => {
    res.send(`${ui_styles}<div style="display:flex; justify-content:center; align-items:center; height:100vh; padding:20px">
        <div class="stat-card" style="width:100%; max-width:360px">
            <h1 style="text-align:center">Aura <span style="color:var(--accent)">OS</span></h1>
            <form action="/api/login" method="POST">
                <input name="login" placeholder="E-mail" required>
                <input name="senha" type="password" placeholder="Senha" required>
                <button class="btn-main" style="margin-top:15px">ENTRAR</button>
            </form>
            <p style="text-align:center; font-size:12px; color:var(--sub); margin-top:20px; cursor:pointer" onclick="document.getElementById('reg').style.display='block'">Criar conta corporativa</p>
            <div id="reg" style="display:none; margin-top:15px; border-top:1px solid #1e293b; padding-top:15px">
                <form action="/api/cadastro" method="POST">
                    <input name="nome" placeholder="Nome Completo">
                    <input name="login" placeholder="E-mail">
                    <input name="senha" type="password" placeholder="Senha">
                    <button class="btn-main" style="background:white; color:black">CADASTRAR</button>
                </form>
            </div>
        </div>
    </div>`);
});

app.get('/', auth, (req, res) => {
    res.send(`${ui_styles}
    <aside>
        <h2 style="margin:0">Aura <span style="color:var(--accent)">OS</span></h2>
        <small style="color:var(--sub); font-size:9px; letter-spacing:1px; margin-bottom:30px; display:block">MOBILE ENTERPRISE</small>
        <div class="nav-btn active" onclick="changeTab('dash', this)"><span>📊</span> Dashboard</div>
        <div class="nav-btn" onclick="changeTab('equip', this)"><span>📦</span> Inventário</div>
        <div class="nav-btn" onclick="changeTab('manu', this)"><span>🔧</span> Ativos Alugados</div>
        <div class="nav-btn" style="margin-top:auto" onclick="location.href='/logout'"><span>🚪</span> Sair</div>
    </aside>
    <main id="view"></main>

    <div id="modalAdd" class="modal">
        <div class="modal-content">
            <h3 style="margin-top:0">Novo Registro</h3>
            <input id="inNome" placeholder="Nome do Item">
            <select id="inTipo" onchange="toggleAddFields()">
                <option value="Comprado">Comprado (Consumível)</option>
                <option value="Alugado">Alugado (Com funcionário)</option>
            </select>
            <input id="inCod" placeholder="SKU ou Patrimônio">
            <input id="inQtd" type="number" placeholder="Quantidade" value="1">
            <div id="extraFields" style="display:none">
                <input id="inResp" placeholder="Com quem está?">
                <input id="inEquipe" placeholder="Equipe">
            </div>
            <button class="btn-main" onclick="saveItem()">SALVAR</button>
            <button onclick="document.getElementById('modalAdd').style.display='none'" style="background:none; border:none; color:var(--sub); width:100%; margin-top:10px; cursor:pointer">Voltar</button>
        </div>
    </div>

    <script>
        let currentData = [];

        async function refresh() {
            const res = await fetch('/api/dados');
            currentData = await res.json();
            const active = document.querySelector('.nav-btn.active').innerText;
            if(active.includes('Dashboard')) renderDash();
            else if(active.includes('Inventário')) renderEquip();
            else if(active.includes('Alugados')) renderManu();
        }

        function changeTab(tab, el) {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
            if(tab === 'dash') renderDash();
            if(tab === 'equip') renderEquip();
            if(tab === 'manu') renderManu();
        }

        function toggleAddFields() {
            const tipo = document.getElementById('inTipo').value;
            document.getElementById('extraFields').style.display = tipo === 'Alugado' ? 'block' : 'none';
        }

        function renderDash() {
            const alug = currentData.filter(i => i.tipo === 'Alugado').length;
            const comp = currentData.filter(i => i.tipo === 'Comprado').reduce((a,b)=> a+b.quantidade, 0);
            document.getElementById('view').innerHTML = \`
                <h1>Dashboard</h1>
                <div class="stats-grid">
                    <div class="stat-card"><small>EM USO (ALUGADOS)</small><h2>\${alug}</h2></div>
                    <div class="stat-card"><small>ESTOQUE (UNIDADES)</small><h2>\${comp}</h2></div>
                </div>
                <h3>Movimentações Recentes</h3>
                <div class="table-container">
                    <table>
                        <tr><th>Item</th><th>Status</th><th>Último Portador</th></tr>
                        \${currentData.slice(0,5).map(i => \`<tr>
                            <td>\${i.nome}</td>
                            <td><span class="badge">\${i.status}</span></td>
                            <td>\${i.responsavel} (\${i.equipe})</td>
                        </tr>\`).join('')}
                    </table>
                </div>\`;
        }

        function renderEquip() {
            document.getElementById('view').innerHTML = \`
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
                    <h2>Estoque Comprado</h2>
                    <button class="btn-main" style="width:auto" onclick="document.getElementById('modalAdd').style.display='flex'">+ NOVO</button>
                </div>
                <div class="table-container">
                    <table>
                        <tr><th>SKU</th><th>Item</th><th>Qtd</th><th>Retirado por</th><th>Ação</th></tr>
                        \${currentData.filter(i => i.tipo === 'Comprado').map(i => \`<tr>
                            <td>\${i.codigo_identificador}</td>
                            <td>\${i.nome}</td>
                            <td>\${i.quantidade} un</td>
                            <td>\${i.responsavel}</td>
                            <td><button class="btn-outline" onclick="retirar('\${i.id}')">Saída</button></td>
                        </tr>\`).join('')}
                    </table>
                </div>\`;
        }

        function renderManu() {
            document.getElementById('view').innerHTML = \`
                <h2>Ativos Alugados</h2>
                <div class="table-container">
                    <table>
                        <tr><th>Patrimônio</th><th>Item</th><th>Funcionário</th><th>Equipe</th><th>Status</th></tr>
                        \${currentData.filter(i => i.tipo === 'Alugado').map(i => \`<tr>
                            <td>#\${i.codigo_identificador}</td>
                            <td>\${i.nome}</td>
                            <td>\${i.responsavel}</td>
                            <td><span class="badge">\${i.equipe}</span></td>
                            <td>\${i.status}</td>
                        </tr>\`).join('')}
                    </table>
                </div>\`;
        }

        async function saveItem() {
            const body = {
                nome: document.getElementById('inNome').value,
                tipo: document.getElementById('inTipo').value,
                codigo: document.getElementById('inCod').value,
                qtd: document.getElementById('inQtd').value,
                responsavel: document.getElementById('inResp').value || 'Estoque',
                equipe: document.getElementById('inEquipe').value || 'Geral'
            };
            await fetch('/api/estoque/add', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
            document.getElementById('modalAdd').style.display='none';
            refresh();
        }

        async function retirar(id) {
            const qtd = prompt("Quantidade:");
            const resp = prompt("Nome de quem está retirando:");
            const eqp = prompt("Equipe:");
            if(qtd && resp) {
                await fetch('/api/estoque/retirar', { 
                    method:'POST', 
                    headers:{'Content-Type':'application/json'}, 
                    body: JSON.stringify({id, qtd, responsavel: resp, equipe: eqp}) 
                });
                refresh();
            }
        }

        refresh();
    </script>`);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Aura OS rodando na porta ' + PORT));
