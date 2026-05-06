require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const session = require('express-session');
const app = express();


async function startServer() {
    try {
        await sequelize.authenticate();
        console.log('✅ Conectado ao Neon PostgreSQL');
        await sequelize.sync(); // Cria as tabelas se não existirem
        
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, '0.0.0.0', () => console.log(`Rodando em http://0.0.0.0:${PORT}`));
    } catch (err) {
        console.error('❌ Erro crítico na inicialização:', err);
    }
}

startServer();

// --- MODELOS ---
const Empresa = sequelize.define('Empresa', {
    dominio: { type: DataTypes.STRING, unique: true }
}, { tableName: 'empresas', timestamps: false });

const Usuario = sequelize.define('Usuario', {
    nome: { type: DataTypes.STRING },
    login: { type: DataTypes.STRING, unique: true },
    senha: { type: DataTypes.STRING },
    assinatura_ativa: { type: DataTypes.INTEGER, defaultValue: 0 },
    empresa_id: { type: DataTypes.INTEGER }
}, { tableName: 'usuarios', timestamps: false });

const Estoque = sequelize.define('Estoque', {
    nome: { type: DataTypes.STRING },
    tipo: { type: DataTypes.STRING },
    codigo_identificador: { type: DataTypes.STRING },
    quantidade: { type: DataTypes.INTEGER, defaultValue: 0 },
    status: { type: DataTypes.STRING, defaultValue: 'Disponível' },
    empresa_id: { type: DataTypes.INTEGER }
}, { tableName: 'estoque', timestamps: false });

// Conectar e Sincronizar
sequelize.authenticate()
    .then(() => {
        console.log('✅ Conectado ao Neon PostgreSQL');
        return sequelize.sync();
    })
    .catch(err => console.error('❌ Erro de conexão:', err));

// --- MIDDLEWARES ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ 
    secret: 'aura-quantum-2026', 
    resave: false, 
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } 
}));

const auth = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.assinatura_ativa === 0 && req.url !== '/assinatura' && req.url !== '/api/assinar') return res.redirect('/assinatura');
    next();
};

// --- API ROUTES ---
app.get('/api/dados', auth, async (req, res) => {
    const itens = await Estoque.findAll({ where: { empresa_id: req.session.user.empresa_id } });
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

// Localize app.post('/api/estoque/add', ...) e substitua por este:
app.post('/api/estoque/add', auth, async (req, res) => {
    const { nome, tipo, codigo, qtd } = req.body;
    const empresa_id = req.session.user.empresa_id;
    const quantidadeAdicional = parseInt(qtd) || 0;

    try {
        // Busca se o produto já existe para ESTA empresa e com ESTE código
        const itemExistente = await Estoque.findOne({ 
            where: { 
                codigo_identificador: codigo, 
                empresa_id: empresa_id 
            } 
        });

        if (itemExistente) {
            // Se achou, ele apenas soma a nova quantidade à existente
            await itemExistente.increment('quantidade', { by: quantidadeAdicional });
            return res.json({ ok: true, msg: "Quantidade atualizada" });
        } else {
            // Se não achou, cria um novo registro do zero
            await Estoque.create({
                empresa_id,
                nome, 
                tipo, 
                codigo_identificador: codigo, 
                quantidade: quantidadeAdicional
            });
            return res.json({ ok: true, msg: "Novo item cadastrado" });
        }
    } catch (err) {
        res.status(500).json({ error: "Erro interno no servidor" });
    }
});

// Localize app.post('/api/estoque/retirar', ...) e substitua por este:
app.post('/api/estoque/retirar', auth, async (req, res) => {
    const { id, qtd } = req.body;
    const valorRetirada = parseInt(qtd);

    if (!valorRetirada || valorRetirada <= 0) {
        return res.status(400).json({ error: "Quantidade inválida" });
    }

    const item = await Estoque.findOne({ 
        where: { id, empresa_id: req.session.user.empresa_id } 
    });

    if (item && item.quantidade >= valorRetirada) {
        await item.decrement('quantidade', { by: valorRetirada });
        res.json({ ok: true });
    } else {
        res.status(400).json({ error: "Saldo insuficiente para saída" });
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

app.post('/api/assinar', auth, async (req, res) => {
    await Usuario.update({ assinatura_ativa: 1 }, { where: { id: req.session.user.id } });
    req.session.user.assinatura_ativa = 1;
    res.json({ ok: true });
});

// --- UI ENGINE ---
const ui_styles = `
<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
    :root { --bg: #05070a; --card: #0f1218; --accent: #38bdf8; --text: #ffffff; --sub: #94a3b8; --danger: #f87171; --success: #10b981; }
    body { font-family: 'Urbanist', sans-serif; background: var(--bg); color: var(--text); margin:0; display:flex; height:100vh; overflow:hidden; }
    aside { width: 260px; background: #0a0d12; border-right: 1px solid #1e293b; display:flex; flex-direction:column; padding: 20px; }
    .nav-btn { padding: 14px; cursor: pointer; color: var(--sub); border-radius: 12px; margin-bottom: 8px; transition: 0.2s; display:flex; align-items:center; gap:12px; font-weight: 500; }
    .nav-btn:hover, .nav-btn.active { background: #111827; color: var(--accent); }
    main { flex:1; padding: 40px; overflow-y:auto; }
    .stats-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: var(--card); padding: 25px; border-radius: 16px; border: 1px solid #1e293b; transition: 0.3s; }
    .stat-card:hover { border-color: var(--accent); }
    .chart-sim { height: 6px; background: #1e293b; border-radius: 10px; margin-top: 15px; overflow: hidden; }
    .chart-fill { height: 100%; background: var(--accent); transition: 0.8s ease-in-out; }
    .table-container { background: var(--card); border-radius: 16px; padding: 10px; border: 1px solid #1e293b; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align:left; color: var(--sub); padding: 15px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #1e293b; }
    td { padding: 15px; border-bottom: 1px solid #111827; font-size: 14px; }
    .btn-main { background: var(--accent); color: black; font-weight: 700; padding: 12px 24px; border:none; border-radius:10px; cursor:pointer; transition: 0.2s; }
    .btn-main:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(56, 189, 248, 0.4); }
    .btn-outline { background:none; border:1px solid #1e293b; color:white; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:12px; transition: 0.2s; }
    .btn-outline:hover { background: #1e293b; }
    .modal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); justify-content:center; align-items:center; z-index:100; backdrop-filter: blur(5px); }
    input, select { background: #111827; border: 1px solid #1e293b; color: white; padding: 12px; border-radius: 10px; margin: 8px 0; width: 100%; outline: none; }
    .badge { padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; }
    .badge-blue { background: rgba(56, 189, 248, 0.2); color: var(--accent); }
    .badge-red { background: rgba(248, 113, 113, 0.2); color: var(--danger); }
</style>
`;

app.get('/login', (req, res) => {
    res.send(`${ui_styles}<div style="display:flex; justify-content:center; align-items:center; height:100vh">
        <div class="stat-card" style="width:360px">
            <h1 style="text-align:center; margin-bottom:5px">Aura <span style="color:var(--accent)">OS</span></h1>
            <p style="text-align:center; color:var(--sub); font-size:14px; margin-bottom:30px">Enterprise Resource Planning</p>
            <form action="/api/login" method="POST">
                <input name="login" placeholder="E-mail Corporativo" required>
                <input name="senha" type="password" placeholder="Senha" required>
                <button class="btn-main" style="width:100%; margin-top:15px">ACESSAR PAINEL</button>
            </form>
            <p style="text-align:center; font-size:13px; color:var(--sub); margin-top:20px; cursor:pointer" onclick="document.getElementById('reg').style.display='block'">Registrar nova empresa</p>
            <div id="reg" style="display:none; margin-top:15px; border-top: 1px solid #1e293b; padding-top:15px">
                <form action="/api/cadastro" method="POST">
                    <input name="nome" placeholder="Nome Completo">
                    <input name="login" placeholder="E-mail">
                    <input name="senha" type="password" placeholder="Senha">
                    <button class="btn-main" style="width:100%; background:white; color:black">CRIAR CONTA</button>
                </form>
            </div>
        </div>
    </div>`);
});

app.get('/assinatura', auth, (req, res) => {
    res.send(`${ui_styles}<div style="display:flex; justify-content:center; align-items:center; height:100vh">
        <div class="stat-card" style="text-align:center; max-width:400px">
            <h2 style="color:var(--accent)">Ativação Necessária</h2>
            <p style="color:var(--sub)">Sua empresa foi detectada no cluster <b>uCore</b>. Ative o dashboard para sincronizar os ativos de rede e estoque.</p>
            <button class="btn-main" style="width:100%; margin-top:20px" onclick="fetch('/api/assinar',{method:'POST'}).then(()=>location.href='/')">ATIVAR AURA OS</button>
        </div>
    </div>`);
});

app.get('/', auth, (req, res) => {
    res.send(`${ui_styles}
    <aside>
        <div style="margin-bottom:40px; padding-left:10px">
            <h2 style="margin:0">Aura <span style="color:var(--accent)">OS</span></h2>
            <small style="color:var(--sub); text-transform:uppercase; font-size:10px; letter-spacing:1px">uCore Cloud Computing</small>
        </div>
        <div class="nav-btn active" onclick="changeTab('dash', this)"><span>📊</span> Dashboard</div>
        <div class="nav-btn" onclick="changeTab('equip', this)"><span>📦</span> Inventário</div>
        <div class="nav-btn" onclick="changeTab('manu', this)"><span>🔧</span> Manutenção</div>
        <div class="nav-btn" style="margin-top:auto" onclick="location.href='/logout'"><span>🚪</span> Encerrar Sessão</div>
    </aside>
    <main id="view"></main>

    <div id="modalAdd" class="modal">
        <div class="stat-card" style="width:400px">
            <h3 style="margin-top:0">Novo Registro de Ativo</h3>
            <label style="font-size:12px; color:var(--sub)">Nome do Item</label>
            <input id="inNome" placeholder="Ex: MacBook Pro M2">
            <label style="font-size:12px; color:var(--sub)">Categoria</label>
            <select id="inTipo">
                <option value="Alugado">Alugado (Ativo Permanente)</option>
                <option value="Comprado">Comprado (Consumível)</option>
            </select>
            <label style="font-size:12px; color:var(--sub)">ID / SKU</label>
            <input id="inCod" placeholder="Ex: AUR-9920">
            <label style="font-size:12px; color:var(--sub)">Quantidade Inicial</label>
            <input id="inQtd" type="number" value="1">
            <button class="btn-main" style="width:100%; margin-top:10px" onclick="saveItem()">CONFIRMAR CADASTRO</button>
            <button onclick="document.getElementById('modalAdd').style.display='none'" style="width:100%; background:none; border:none; color:var(--sub); margin-top:15px; cursor:pointer">Voltar</button>
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
                <h1 style="margin-top:0">Visão Geral</h1>
                <div class="stats-grid">
                    <div class="stat-card">
                        <small style="color:var(--sub)">ATIVOS PERMANENTES</small>
                        <h2 style="margin:10px 0">\${alug}</h2>
                        <div class="chart-sim"><div class="chart-fill" style="width:\${Math.min(alug*10, 100)}%"></div></div>
                    </div>
                    <div class="stat-card">
                        <small style="color:var(--sub)">SKUs EM ESTOQUE</small>
                        <h2 style="margin:10px 0">\${comp}</h2>
                        <div class="chart-sim"><div class="chart-fill" style="width:65%; background:var(--success)"></div></div>
                    </div>
                    <div class="stat-card">
                        <small style="color:var(--sub)">EM MANUTENÇÃO</small>
                        <h2 style="margin:10px 0; color:var(--danger)">\${manu}</h2>
                        <div class="chart-sim"><div class="chart-fill" style="width:\${Math.min(manu*20, 100)}%; background:var(--danger)"></div></div>
                    </div>
                </div>
                <div class="table-container">
                    <div style="padding:20px"><h3>Logs Recentes</h3></div>
                    <table>
                        <tr><th>ID</th><th>Ativo</th><th>Categoria</th><th>Status</th></tr>
                        \${currentData.slice(-5).reverse().map(i => \`<tr>
                            <td><span class="badge badge-blue">#\${i.codigo_identificador}</span></td>
                            <td>\${i.nome}</td>
                            <td>\${i.tipo}</td>
                            <td>\${i.status}</td>
                        </tr>\`).join('')}
                    </table>
                </div>\`;
        }

        function renderEquip() {
            document.getElementById('view').innerHTML = \`
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px">
                    <h1 style="margin:0">Inventário de Ativos</h1>
                    <button class="btn-main" onclick="document.getElementById('modalAdd').style.display='flex'">+ NOVO ITEM</button>
                </div>
                <div class="table-container">
                    <table>
                        <tr><th>ID / SKU</th><th>Item</th><th>Categoria</th><th>Qtd / Status</th><th>Ações</th></tr>
                        \${currentData.map(i => \`<tr>
                            <td><b style="color:var(--accent)">\${i.codigo_identificador}</b></td>
                            <td>\${i.nome}</td>
                            <td>\${i.tipo}</td>
                            <td>\${i.tipo === 'Alugado' ? \`<span class="badge \${i.status === 'Manutenção' ? 'badge-red' : 'badge-blue'}">\${i.status}</span>\` : i.quantidade + ' un'}</td>
                            <td>
                                \${i.tipo === 'Comprado' ? \`<button class="btn-outline" onclick="retirar('\${i.id}')">Saída</button>\` : ''}
                                <button class="btn-outline" style="color:var(--danger)" onclick="deleteItem('\${i.id}')">Remover</button>
                            </td>
                        </tr>\`).join('')}
                    </table>
                </div>\`;
        }

        function renderManu() {
            const alugados = currentData.filter(i => i.tipo === 'Alugado');
            document.getElementById('view').innerHTML = \`
                <h1 style="margin-top:0">Centro de Manutenção</h1>
                <div class="table-container">
                    <table>
                        <tr><th>Patrimônio</th><th>Ativo</th><th>Estado Atual</th><th>Ação Técnica</th></tr>
                        \${alugados.map(i => \`<tr>
                            <td>#\${i.codigo_identificador}</td>
                            <td>\${i.nome}</td>
                            <td><b style="color:\${i.status === 'Manutenção' ? 'var(--danger)' : 'var(--success)'}">\${i.status}</b></td>
                            <td>
                                \${i.status === 'Disponível' ? 
                                \`<button class="btn-outline" onclick="setStatus('\${i.id}', 'Manutenção')">Encaminhar p/ Reparo</button>\` : 
                                \`<button class="btn-main" style="padding:5px 10px; font-size:12px" onclick="setStatus('\${i.id}', 'Disponível')">Finalizar Manutenção</button>\`}
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
            if(!body.nome || !body.codigo) return alert("Preencha todos os campos");
            await fetch('/api/estoque/add', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
            document.getElementById('modalAdd').style.display='none';
            refresh();
        }

        async function retirar(id) {
            const qtd = prompt("Quantidade para saída:");
            if(qtd && !isNaN(qtd)) {
                await fetch('/api/estoque/retirar', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, qtd}) });
                refresh();
            }
        }

        async function setStatus(id, s) {
            await fetch('/api/estoque/status', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, status:s}) });
            refresh();
        }

        async function deleteItem(id) {
            if(confirm("Excluir definitivamente este registro?")) {
                await fetch('/api/estoque/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id}) });
                refresh();
            }
        }

        refresh();
    </script>`);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Aura OS rodando na porta ${PORT}`));
