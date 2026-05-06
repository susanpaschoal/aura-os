require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const session = require('express-session');
const app = express();

// --- CONFIGURAÇÃO DO BANCO DE DADOS ---
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
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
    assinatura_ativa: { type: DataTypes.INTEGER, defaultValue: 0 },
    empresa_id: { type: DataTypes.INTEGER }
}, { tableName: 'usuarios', timestamps: false });

const Estoque = sequelize.define('Estoque', {
    nome: { type: DataTypes.STRING },
    tipo: { type: DataTypes.STRING }, // 'Comprado' (Insumo) ou 'Alugado' (Máquina)
    codigo_identificador: { type: DataTypes.STRING },
    quantidade: { type: DataTypes.INTEGER, defaultValue: 0 },
    status: { type: DataTypes.STRING, defaultValue: 'Disponível' },
    responsavel: { type: DataTypes.STRING, defaultValue: 'Almoxarifado' }, // Responsável Fixo
    quem_retirou: { type: DataTypes.STRING }, // Nome de quem pegou o item
    ultima_saida: { type: DataTypes.DATE },
    empresa_id: { type: DataTypes.INTEGER }
}, { tableName: 'estoque', timestamps: false });

// Sincronização com { alter: true } para não perder dados ao adicionar colunas
sequelize.sync({ alter: true }).then(() => console.log('✅ Banco de Dados Sincronizado'));

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
    next();
};

// --- API ROUTES ---
app.get('/api/dados', auth, async (req, res) => {
    const itens = await Estoque.findAll({ 
        where: { empresa_id: req.session.user.empresa_id },
        order: [['ultima_saida', 'DESC']]
    });
    res.json(itens);
});

app.post('/api/estoque/add', auth, async (req, res) => {
    const { nome, tipo, codigo, qtd } = req.body;
    const empresa_id = req.session.user.empresa_id;

    try {
        const [item, created] = await Estoque.findOrCreate({
            where: { codigo_identificador: codigo, empresa_id },
            defaults: { nome, tipo, quantidade: qtd, responsavel: 'Almoxarifado' }
        });
        if (!created) await item.increment('quantidade', { by: parseInt(qtd) });
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/estoque/retirar', auth, async (req, res) => {
    const { id, qtd, quem } = req.body;
    const item = await Estoque.findOne({ where: { id, empresa_id: req.session.user.empresa_id } });

    if (item && item.quantidade >= parseInt(qtd)) {
        await item.update({
            quantidade: item.quantidade - parseInt(qtd),
            quem_retirou: quem,
            ultima_saida: new Date()
        });
        res.json({ ok: true });
    } else {
        res.status(400).json({ error: "Saldo insuficiente" });
    }
});

// --- UI ENGINE (DESIGN MOBILE-FIRST) ---
const ui_styles = `
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;600;700&display=swap" rel="stylesheet">
<style>
    :root { --bg: #05070a; --card: #0f1218; --accent: #38bdf8; --text: #ffffff; --sub: #94a3b8; }
    body { font-family: 'Urbanist', sans-serif; background: var(--bg); color: var(--text); margin:0; padding-bottom: 80px; }
    main { padding: 20px; }
    .card { background: var(--card); border: 1px solid #1e293b; border-radius: 16px; padding: 15px; margin-bottom: 12px; }
    .bottom-nav { position: fixed; bottom: 0; left: 0; width: 100%; background: #0a0d12; border-top: 1px solid #1e293b; display: flex; justify-content: space-around; padding: 10px 0; z-index: 100; }
    .nav-item { color: var(--sub); text-align: center; font-size: 11px; text-decoration: none; cursor:pointer; }
    .nav-item.active { color: var(--accent); }
    .nav-item span { display: block; font-size: 20px; margin-bottom: 4px; }
    .btn-main { background: var(--accent); color: black; font-weight: 700; border: none; padding: 12px; border-radius: 12px; width: 100%; cursor: pointer; }
    .badge { padding: 4px 8px; border-radius: 6px; font-size: 11px; background: rgba(56, 189, 248, 0.1); color: var(--accent); }
    .modal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); justify-content:center; align-items:center; z-index:200; padding: 20px; box-sizing:border-box; }
    input, select { background: #111827; border: 1px solid #1e293b; color: white; padding: 12px; border-radius: 10px; width: 100%; margin-bottom: 10px; box-sizing: border-box; }
</style>
`;

app.get('/', auth, (req, res) => {
    res.send(`${ui_styles}
    <main id="app">
        <h2 id="view-title">Dashboard</h2>
        <div id="content"></div>
    </main>

    <div class="bottom-nav">
        <div class="nav-item active" onclick="render('dash', this)"><span>📊</span>Painel</div>
        <div class="nav-item" onclick="render('estoque', this)"><span>📦</span>Materiais</div>
        <div class="nav-item" onclick="render('maquinas', this)"><span>🚜</span>Máquinas</div>
        <div class="nav-item" onclick="render('saidas', this)"><span>📑</span>Saídas</div>
        <div class="nav-item" onclick="location.href='/logout'"><span>🚪</span>Sair</div>
    </div>

    <!-- Modal de Saída -->
    <div id="modalRetirar" class="modal">
        <div class="card" style="width:100%">
            <h3>Registrar Saída</h3>
            <input type="hidden" id="retirarId">
            <input type="number" id="retirarQtd" placeholder="Quantidade">
            <input type="text" id="retirarQuem" placeholder="Nome de quem retirou">
            <button class="btn-main" onclick="confirmarSaida()">CONFIRMAR</button>
            <button onclick="closeModal()" style="background:none; border:none; color:var(--sub); width:100%; margin-top:10px">Cancelar</button>
        </div>
    </div>

    <script>
        let dados = [];
        async function load() {
            const r = await fetch('/api/dados');
            dados = await r.json();
            render('dash', document.querySelector('.nav-item'));
        }

        function render(view, el) {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            el.classList.add('active');
            const content = document.getElementById('content');
            let html = '';

            if(view === 'dash') {
                const totalInsumos = dados.filter(i => i.tipo === 'Comprado').reduce((a,b) => a + b.quantidade, 0);
                html = \`<div class="card"><h3>Bem-vindo</h3><p>Total de itens em estoque: <b>\${totalInsumos}</b></p></div>\`;
            }

            if(view === 'estoque' || view === 'maquinas') {
                const filtro = view === 'estoque' ? 'Comprado' : 'Alugado';
                html = dados.filter(i => i.tipo === filtro).map(i => \`
                    <div class="card">
                        <div style="display:flex; justify-content:space-between">
                            <b>\${i.nome}</b>
                            <span class="badge">\${i.quantidade} un</span>
                        </div>
                        <p style="color:var(--sub); font-size:12px; margin: 10px 0">Cod: \${i.codigo_identificador} | Resp: \${i.responsavel}</p>
                        <button class="btn-main" style="padding: 5px; font-size:12px" onclick="openRetirar('\${i.id}')">REGISTRAR SAÍDA</button>
                    </div>
                \`).join('');
            }

            if(view === 'saidas') {
                html = dados.filter(i => i.quem_retirou).map(i => \`
                    <div class="card" style="border-left: 4px solid var(--accent)">
                        <div style="font-size:11px; color:var(--sub)">\${new Date(i.ultima_saida).toLocaleString('pt-BR')}</div>
                        <div style="margin:5px 0"><b>\${i.nome}</b></div>
                        <div style="font-size:13px">Retirado por: <span style="color:var(--accent)">\${i.quem_retirou}</span></div>
                    </div>
                \`).join('');
            }

            content.innerHTML = html;
        }

        function openRetirar(id) { 
            document.getElementById('retirarId').value = id;
            document.getElementById('modalRetirar').style.display = 'flex'; 
        }

        function closeModal() { document.getElementById('modalRetirar').style.display = 'none'; }

        async function confirmarSaida() {
            const id = document.getElementById('retirarId').value;
            const qtd = document.getElementById('retirarQtd').value;
            const quem = document.getElementById('retirarQuem').value;
            if(!quem) return alert("Informe quem está retirando!");

            await fetch('/api/estoque/retirar', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({id, qtd, quem})
            });
            closeModal();
            load();
        }

        load();
    </script>`);
});

app.get('/login', (req, res) => { /* Mantido igual ao seu código anterior */ });
app.post('/api/login', async (req, res) => { /* Mantido igual */ });
app.post('/api/cadastro', async (req, res) => { /* Mantido igual */ });
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.listen(3000, () => console.log('Aura OS [MOBILE EDITION] rodando em http://localhost:3000'));
