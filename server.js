require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÃO DO BANCO (Neon PostgreSQL) ---
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    logging: false
});

// --- MODELOS ---
const Produto = sequelize.define('Produto', {
    codigo: { type: DataTypes.STRING, unique: true, allowNull: false },
    nome: { type: DataTypes.STRING, allowNull: false },
    quantidade: { type: DataTypes.INTEGER, defaultValue: 0 },
    tipo: { type: DataTypes.STRING, defaultValue: 'Comprado' }, // 'Alugado' ou 'Comprado'
    status: { type: DataTypes.STRING, defaultValue: 'Disponível' } // 'Disponível' ou 'Manutenção'
});

const Movimentacao = sequelize.define('Movimentacao', {
    item_nome: { type: DataTypes.STRING },
    quantidade: { type: DataTypes.INTEGER },
    equipe: { type: DataTypes.STRING },
    responsavel: { type: DataTypes.STRING },
    data: { type: DataTypes.DATE, defaultValue: Sequelize.NOW }
});

// --- ROTAS DA API ---

// 1. Busca todos os dados para o sistema
app.get('/api/dados', async (req, res) => {
    try {
        const itens = await Produto.findAll({ order: [['nome', 'ASC']] });
        const historico = await Movimentacao.findAll({ order: [['data', 'DESC']], limit: 20 });
        res.json({ itens, historico });
    } catch (err) { res.status(500).json(err); }
});

// 2. Adicionar ou Incrementar item
app.post('/api/estoque/add', async (req, res) => {
    const { codigo, nome, qtd, tipo } = req.body;
    try {
        let produto = await Produto.findOne({ where: { codigo } });
        if (produto) {
            await produto.increment('quantidade', { by: parseInt(qtd) });
            res.json(await produto.reload());
        } else {
            const novo = await Produto.create({ codigo, nome, quantidade: parseInt(qtd), tipo });
            res.status(201).json(novo);
        }
    } catch (err) { res.status(500).json(err); }
});

// 3. Registrar Retirada (Baixa com Responsável)
app.post('/api/estoque/retirar', async (req, res) => {
    const { id, qtd, equipe, responsavel } = req.body;
    try {
        const produto = await Produto.findByPk(id);
        if (!produto || produto.quantidade < qtd) return res.status(400).json({ error: 'Estoque insuficiente' });

        await produto.decrement('quantidade', { by: parseInt(qtd) });
        await Movimentacao.create({ item_nome: produto.nome, quantidade: parseInt(qtd), equipe, responsavel });
        res.json({ success: true });
    } catch (err) { res.status(500).json(err); }
});

// 4. Alterar Status de Manutenção
app.post('/api/estoque/status', async (req, res) => {
    const { id, status } = req.body;
    try {
        await Produto.update({ status }, { where: { id } });
        res.json({ success: true });
    } catch (err) { res.status(500).json(err); }
});

// --- INTERFACE (UI) ---
const ui_styles = `
<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
    :root { --bg: #05070a; --card: #0f1218; --accent: #38bdf8; --text: #ffffff; --sub: #94a3b8; --danger: #f87171; --success: #10b981; }
    body { font-family: 'Urbanist', sans-serif; background: var(--bg); color: var(--text); margin:0; display:flex; height:100vh; overflow:hidden; }
    aside { width: 260px; background: #0a0d12; border-right: 1px solid #1e293b; display:flex; flex-direction:column; padding: 20px; }
    .nav-btn { padding: 14px; cursor: pointer; color: var(--sub); border-radius: 12px; margin-bottom: 8px; transition: 0.2s; display:flex; align-items:center; gap:12px; font-weight: 500; }
    .nav-btn:hover, .nav-btn.active { background: #111827; color: var(--accent); }
    main { flex:1; padding: 40px; overflow-y:auto; background: radial-gradient(circle at top right, #0f172a, #05070a); }
    .stats-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: var(--card); padding: 25px; border-radius: 16px; border: 1px solid #1e293b; transition: 0.3s; }
    .stat-card:hover { border-color: var(--accent); }
    .table-container { background: var(--card); border-radius: 16px; padding: 10px; border: 1px solid #1e293b; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align:left; color: var(--sub); padding: 15px; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #1e293b; }
    td { padding: 15px; border-bottom: 1px solid #111827; font-size: 14px; }
    .btn-main { background: var(--accent); color: black; font-weight: 700; padding: 12px 20px; border:none; border-radius:10px; cursor:pointer; }
    .btn-outline { background:none; border:1px solid #1e293b; color:white; padding:6px 12px; border-radius:8px; cursor:pointer; }
    .btn-outline:hover { background: #1e293b; }
    .modal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); justify-content:center; align-items:center; z-index:100; backdrop-filter: blur(8px); }
    input, select { background: #111827; border: 1px solid #1e293b; color: white; padding: 12px; border-radius: 10px; margin: 8px 0; width: 100%; box-sizing: border-box; }
    .badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; }
    .badge-success { background: #064e3b; color: #34d399; }
    .badge-danger { background: #7f1d1d; color: #f87171; }
</style>
`;

app.get('/', (req, res) => {
    res.send(`${ui_styles}
    <aside>
        <div style="margin-bottom:40px"><h2>Aura <span style="color:var(--accent)">OS</span></h2></div>
        <div class="nav-btn active" onclick="changeTab('dash', this)">📊 Dashboard</div>
        <div class="nav-btn" onclick="changeTab('equip', this)">📦 Inventário</div>
        <div class="nav-btn" onclick="changeTab('hist', this)">📜 Histórico</div>
        <div class="nav-btn" onclick="changeTab('manu', this)">🛠️ Manutenção</div>
    </aside>
    <main id="view"></main>

    <!-- Modal Adicionar -->
    <div id="modalAdd" class="modal">
        <div class="stat-card" style="width:400px">
            <h3>Novo Cadastro</h3>
            <input id="inNome" placeholder="Nome do Equipamento/Material">
            <select id="inTipo"><option value="Alugado">Alugado (Permanente)</option><option value="Comprado">Comprado (Consumível)</option></select>
            <input id="inCod" placeholder="Código ou Patrimônio">
            <input id="inQtd" type="number" value="1" placeholder="Quantidade">
            <button class="btn-main" style="width:100%" onclick="saveItem()">SALVAR NO SISTEMA</button>
            <button class="btn-outline" style="width:100%; margin-top:10px; border:none" onclick="closeM('modalAdd')">CANCELAR</button>
        </div>
    </div>

    <!-- Modal Retirada -->
    <div id="modalRetirar" class="modal">
        <div class="stat-card" style="width:400px">
            <h3 id="retTitle">Baixa de Material</h3>
            <input id="retID" type="hidden">
            <input id="retQtd" type="number" placeholder="Quantidade para retirar">
            <input id="retEquipe" placeholder="Equipe (Ex: Sialdrill)">
            <input id="retResp" placeholder="Nome do Responsável">
            <button class="btn-main" style="width:100%" onclick="confirmarRetirada()">CONFIRMAR RETIRADA</button>
            <button class="btn-outline" style="width:100%; margin-top:10px; border:none" onclick="closeM('modalRetirar')">CANCELAR</button>
        </div>
    </div>

    <script>
        let currentData = { itens: [], historico: [] };
        
        async function refresh() {
            const res = await fetch('/api/dados');
            currentData = await res.json();
            renderCurrentTab();
        }

        function closeM(id) { document.getElementById(id).style.display='none'; }

        function renderCurrentTab() {
            const active = document.querySelector('.nav-btn.active').innerText;
            if(active.includes('Dashboard')) renderDash();
            else if(active.includes('Inventário')) renderEquip();
            else if(active.includes('Histórico')) renderHist();
            else if(active.includes('Manutenção')) renderManu();
        }

        function changeTab(tab, el) {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
            refresh();
        }

        // Funções de Ação
        async function saveItem() {
            const body = { 
                nome: document.getElementById('inNome').value, 
                tipo: document.getElementById('inTipo').value, 
                codigo: document.getElementById('inCod').value, 
                qtd: document.getElementById('inQtd').value 
            };
            await fetch('/api/estoque/add', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
            closeM('modalAdd');
            refresh();
        }

        function openRetirada(id, nome) {
            document.getElementById('retID').value = id;
            document.getElementById('retTitle').innerText = "Retirar: " + nome;
            document.getElementById('modalRetirar').style.display = 'flex';
        }

        async function confirmarRetirada() {
            const body = { 
                id: document.getElementById('retID').value, 
                qtd: document.getElementById('retQtd').value, 
                equipe: document.getElementById('retEquipe').value, 
                responsavel: document.getElementById('retResp').value 
            };
            const res = await fetch('/api/estoque/retirar', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
            if(!res.ok) alert("Erro: Estoque insuficiente!");
            closeM('modalRetirar');
            refresh();
        }

        async function toggleManutencao(id, statusAtual) {
            const novoStatus = statusAtual === 'Disponível' ? 'Manutenção' : 'Disponível';
            await fetch('/api/estoque/status', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, status: novoStatus}) });
            refresh();
        }

        // Renderização de Telas
        function renderDash() {
            const alug = currentData.itens.filter(i => i.tipo === 'Alugado').length;
            const comp = currentData.itens.filter(i => i.tipo === 'Comprado').reduce((a,b)=> a + b.quantidade, 0);
            const manu = currentData.itens.filter(i => i.status === 'Manutenção').length;

            document.getElementById('view').innerHTML = \`
                <h1>Dashboard Central</h1>
                <div class="stats-grid">
                    <div class="stat-card"><small>EQUIPAMENTOS ATIVOS</small><h2 style="color:var(--accent)">\${alug}</h2></div>
                    <div class="stat-card"><small>ITENS EM ESTOQUE</small><h2>\${comp}</h2></div>
                    <div class="stat-card"><small>EM MANUTENÇÃO</small><h2 style="color:var(--danger)">\${manu}</h2></div>
                </div>
                <h3>Últimas Movimentações</h3>
                <div class="table-container">
                    <table>
                        \${currentData.historico.slice(0,5).map(h => \`<tr><td>\${h.responsavel} retirou \${h.quantidade}x \${h.item_nome}</td><td style="text-align:right; color:var(--sub)">\${new Date(h.data).toLocaleDateString()}</td></tr>\`).join('')}
                    </table>
                </div>\`;
        }

        function renderEquip() {
            document.getElementById('view').innerHTML = \`
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
                    <h1>Inventário Geral</h1>
                    <button class="btn-main" onclick="document.getElementById('modalAdd').style.display='flex'">+ NOVO ITEM</button>
                </div>
                <div class="table-container">
                    <table>
                        <tr><th>Cód</th><th>Item</th><th>Tipo</th><th>Qtd</th><th>Ação</th></tr>
                        \${currentData.itens.map(i => \`<tr>
                            <td>#\${i.codigo}</td>
                            <td>\${i.nome}</td>
                            <td><span class="badge" style="background:#1e293b">\${i.tipo}</span></td>
                            <td>\${i.quantidade}</td>
                            <td><button class="btn-outline" onclick="openRetirada('\${i.id}', '\${i.nome}')">Baixa</button></td>
                        </tr>\`).join('')}
                    </table>
                </div>\`;
        }

        function renderHist() {
            document.getElementById('view').innerHTML = \`
                <h1>Histórico de Saídas</h1>
                <div class="table-container">
                    <table>
                        <tr><th>Data</th><th>Responsável</th><th>Item</th><th>Qtd</th><th>Equipe</th></tr>
                        \${currentData.historico.map(h => \`<tr>
                            <td>\${new Date(h.data).toLocaleDateString()}</td>
                            <td style="color:var(--accent); font-weight:bold">\${h.responsavel}</td>
                            <td>\${h.item_nome}</td>
                            <td>\${h.quantidade}</td>
                            <td>\${h.equipe}</td>
                        </tr>\`).join('')}
                    </table>
                </div>\`;
        }

        function renderManu() {
            const alugados = currentData.itens.filter(i => i.tipo === 'Alugado');
            document.getElementById('view').innerHTML = \`
                <h1>Controle de Manutenção</h1>
                <div class="table-container">
                    <table>
                        <tr><th>Patrimônio</th><th>Equipamento</th><th>Status</th><th>Ação</th></tr>
                        \${alugados.map(i => \`<tr>
                            <td>#\${i.codigo}</td>
                            <td>\${i.nome}</td>
                            <td><span class="badge \${i.status === 'Disponível' ? 'badge-success' : 'badge-danger'}">\${i.status}</span></td>
                            <td>
                                <button class="btn-outline" onclick="toggleManutencao('\${i.id}', '\${i.status}')">
                                    \${i.status === 'Disponível' ? '🛠️ Enviar p/ Reparo' : '✅ Finalizar'}
                                </button>
                            </td>
                        </tr>\`).join('')}
                    </table>
                </div>\`;
        }

        refresh();
    </script>`);
});

const PORT = process.env.PORT || 3000;
sequelize.sync().then(() => {
    app.listen(PORT, () => console.log('🚀 Aura OS: Sistema Completo Online'));
});
