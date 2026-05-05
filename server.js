const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const app = express();

const db = new sqlite3.Database('./aura_enterprise.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS empresas (id INTEGER PRIMARY KEY AUTOINCREMENT, dominio TEXT UNIQUE)`);
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, login TEXT UNIQUE, senha TEXT, 
        empresa_id INTEGER, assinatura_ativa INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS estoque (
        id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER, nome TEXT, tipo TEXT, 
        codigo_identificador TEXT, quantidade INTEGER DEFAULT 0, status TEXT DEFAULT 'Disponível'
    )`);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'aura-quantum-2026', resave: false, saveUninitialized: true }));

const auth = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.assinatura_ativa === 0 && req.url !== '/assinatura' && req.url !== '/api/assinar') return res.redirect('/assinatura');
    next();
};

// --- API ---
app.get('/api/dados', auth, (req, res) => {
    db.all(`SELECT * FROM estoque WHERE empresa_id = ?`, [req.session.user.empresa_id], (err, rows) => res.json(rows));
});

// ROTA ATUALIZADA: ADICIONAR OU INCREMENTAR ESTOQUE
app.post('/api/estoque/add', auth, (req, res) => {
    const { nome, tipo, codigo, qtd } = req.body;
    const empresa_id = req.session.user.empresa_id;
    const quantidadeNova = parseInt(qtd) || 0;

    // Primeiro, verifica se o código já existe para esta empresa
    db.get(`SELECT id, quantidade FROM estoque WHERE codigo_identificador = ? AND empresa_id = ?`, [codigo, empresa_id], (err, row) => {
        if (row) {
            // Se o item já existe, apenas somamos a quantidade (Chegada de item)
            db.run(`UPDATE estoque SET quantidade = quantidade + ? WHERE id = ?`, [quantidadeNova, row.id], () => {
                res.json({ ok: true, msg: "Quantidade incrementada" });
            });
        } else {
            // Se o item não existe, criamos um novo registro
            db.run(`INSERT INTO estoque (empresa_id, nome, tipo, codigo_identificador, quantidade) VALUES (?,?,?,?,?)`,
            [empresa_id, nome, tipo, codigo, quantidadeNova], () => res.json({ ok: true, msg: "Novo item cadastrado" }));
        }
    });
});

app.post('/api/estoque/status', auth, (req, res) => {
    db.run(`UPDATE estoque SET status = ? WHERE id = ?`, [req.body.status, req.body.id], () => res.json({ok:true}));
});

app.post('/api/estoque/retirar', auth, (req, res) => {
    const { id, qtd } = req.body;
    // Garante que a retirada só ocorra se houver saldo suficiente
    db.run(`UPDATE estoque SET quantidade = quantidade - ? WHERE id = ? AND quantidade >= ?`, [qtd, id, qtd], function(err) {
        if (this.changes === 0) return res.status(400).json({ok: false, error: "Saldo insuficiente"});
        res.json({ok:true});
    });
});

app.post('/api/estoque/delete', auth, (req, res) => {
    db.run(`DELETE FROM estoque WHERE id = ? AND empresa_id = ?`, [req.body.id, req.session.user.empresa_id], () => res.json({ok:true}));
});

app.post('/api/login', (req, res) => {
    const { login, senha } = req.body;
    db.get(`SELECT * FROM usuarios WHERE login = ? AND senha = ?`, [login, senha], (err, user) => {
        if (user) { req.session.user = user; res.redirect('/'); }
        else res.send('<script>alert("Erro"); window.location="/login";</script>');
    });
});

app.post('/api/cadastro', (req, res) => {
    const { nome, login, senha } = req.body;
    const dominio = login.split('@')[1] || 'geral';
    db.run(`INSERT OR IGNORE INTO empresas (dominio) VALUES (?)`, [dominio], () => {
        db.get(`SELECT id FROM empresas WHERE dominio = ?`, [dominio], (err, empresa) => {
            db.run(`INSERT INTO usuarios (nome, login, senha, empresa_id) VALUES (?,?,?,?)`, [nome, login, senha, empresa.id], () => res.redirect('/login'));
        });
    });
});

app.post('/api/assinar', auth, (req, res) => {
    db.run(`UPDATE usuarios SET assinatura_ativa = 1 WHERE id = ?`, [req.session.user.id], () => {
        req.session.user.assinatura_ativa = 1; res.json({ok:true});
    });
});

// --- UI (Preservada conforme o original) ---
const ui = `
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
    .chart-sim { height: 4px; background: #1e293b; border-radius: 2px; margin-top: 15px; overflow: hidden; }
    .chart-fill { height: 100%; background: var(--accent); transition: 0.5s; }
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

// ... (Restante do código HTML/JS do cliente permanece igual ao seu original)
app.get('/login', (req, res) => {
    res.send(`${ui}<div style="display:flex; justify-content:center; align-items:center; width:100%">
        <div class="stat-card" style="width:350px">
            <h2 style="text-align:center; color:var(--accent)">Aura OS</h2>
            <form action="/api/login" method="POST">
                <input name="login" placeholder="E-mail" required>
                <input name="senha" type="password" placeholder="Senha" required>
                <button class="btn-main" style="width:100%; margin-top:10px">ENTRAR</button>
            </form>
            <p style="text-align:center; font-size:12px; color:var(--sub); margin-top:15px; cursor:pointer" onclick="document.getElementById('reg').style.display='block'">Cadastrar Empresa</p>
            <div id="reg" style="display:none"><form action="/api/cadastro" method="POST"><input name="nome" placeholder="Nome"><input name="login" placeholder="E-mail"><input name="senha" type="password" placeholder="Senha"><button class="btn-main" style="width:100%">CADASTRAR</button></form></div>
        </div>
    </div>`);
});

app.get('/assinatura', auth, (req, res) => {
    res.send(`${ui}<div style="display:flex; justify-content:center; align-items:center; width:100%">
        <div class="stat-card" style="text-align:center"><h1>uCore Enterprise</h1><button class="btn-main" onclick="fetch('/api/assinar',{method:'POST'}).then(()=>location.href='/')">ATIVAR DASHBOARD</button></div>
    </div>`);
});

app.get('/', auth, (req, res) => {
    res.send(`${ui}
    <aside>
        <div style="margin-bottom:40px"><h2 style="color:var(--accent)">Aura OS</h2><small style="color:var(--sub)">Enterprise uCore</small></div>
        <div class="nav-btn active" onclick="changeTab('dash', this)">📊 Dashboard</div>
        <div class="nav-btn" onclick="changeTab('equip', this)">📦 Inventário</div>
        <div class="nav-btn" onclick="changeTab('manu', this)">🔧 Manutenção</div>
        <div class="nav-btn" style="margin-top:auto" onclick="location.href='/logout'">🚪 Sair</div>
    </aside>
    <main id="view"></main>

    <div id="modalAdd" class="modal">
        <div class="stat-card" style="width:400px">
            <h3>Novo Cadastro / Entrada</h3>
            <input id="inNome" placeholder="Nome do Item">
            <select id="inTipo">
                <option value="Alugado">Alugado (Patrimônio)</option>
                <option value="Comprado">Comprado (Consumível)</option>
            </select>
            <input id="inCod" placeholder="ID/Patrimônio (SKU)">
            <input id="inQtd" type="number" placeholder="Quantidade a adicionar">
            <button class="btn-main" style="width:100%" onclick="saveItem()">CONFIRMAR ENTRADA</button>
            <button onclick="document.getElementById('modalAdd').style.display='none'" style="width:100%; background:none; border:none; color:var(--sub); margin-top:10px">Cancelar</button>
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
                <h1>Visão Geral da Empresa</h1>
                <div class="stats-grid">
                    <div class="stat-card">
                        <h4>ATIVOS ALUGADOS</h4><h2>\${alug}</h2>
                        <div class="chart-sim"><div class="chart-fill" style="width:\${(alug/20)*100}%"></div></div>
                    </div>
                    <div class="stat-card">
                        <h4>ESTOQUE DISPONÍVEL</h4><h2>\${comp}</h2>
                        <div class="chart-sim"><div class="chart-fill" style="width:60%; background:#10b981"></div></div>
                    </div>
                    <div class="stat-card">
                        <h4>STATUS CRÍTICO</h4><h2>\${manu}</h2>
                        <div class="chart-sim"><div class="chart-fill" style="width:\${(manu/10)*100}%; background:#f87171"></div></div>
                    </div>
                </div>
                <div class="table-container">
                    <h3>Atividade de Fluxo</h3>
                    <table>
                        <tr><th>Identificador</th><th>Nome</th><th>Tipo</th><th>Status Atual</th></tr>
                        \${currentData.slice(-4).reverse().map(i => \`<tr><td>#\${i.codigo_identificador}</td><td>\${i.nome}</td><td>\${i.tipo}</td><td>\${i.status}</td></tr>\`).join('')}
                    </table>
                </div>\`;
        }

        function renderEquip() {
            document.getElementById('view').innerHTML = \`
                <div style="display:flex; justify-content:space-between; align-items:center"><h1>Inventário Completo</h1><button class="btn-main" onclick="document.getElementById('modalAdd').style.display='flex'">+ ENTRADA / NOVO ITEM</button></div>
                <div class="table-container">
                    <table>
                        <tr><th>Cód/SKU</th><th>Item</th><th>Categoria</th><th>Saldo/Status</th><th>Ações</th></tr>
                        \${currentData.map(i => \`<tr>
                            <td>\${i.codigo_identificador}</td>
                            <td>\${i.nome}</td>
                            <td>\${i.tipo}</td>
                            <td>\${i.tipo === 'Alugado' ? i.status : i.quantidade + ' un'}</td>
                            <td>
                                \${i.tipo === 'Comprado' ? \`<button class="btn-outline" onclick="retirar('\${i.id}')">Saída</button>\` : ''}
                                <button class="btn-outline" style="border-color:var(--danger); color:var(--danger)" onclick="deleteItem('\${i.id}')">🗑️</button>
                            </td>
                        </tr>\`).join('')}
                    </table>
                </div>\`;
        }

        function renderManu() {
            const emManu = currentData.filter(i => i.tipo === 'Alugado');
            document.getElementById('view').innerHTML = \`
                <h1>Equipamentos em Manutenção</h1>
                <div class="table-container">
                    <table>
                        <tr><th>Patrimônio</th><th>Nome</th><th>Status</th><th>Operação</th></tr>
                        \${emManu.map(i => \`<tr>
                            <td>\${i.codigo_identificador}</td>
                            <td>\${i.nome}</td>
                            <td><b style="color:\${i.status === 'Manutenção' ? 'var(--danger)' : 'var(--accent)'}">\${i.status}</b></td>
                            <td>
                                <button class="btn-outline" onclick="setStatus('\${i.id}', 'Manutenção')">🔧 Solicitar Reparo</button>
                                <button class="btn-outline" onclick="setStatus('\${i.id}', 'Disponível')">✅ Concluir</button>
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
            if(!body.codigo || !body.nome) return alert("Preencha os campos!");
            await fetch('/api/estoque/add', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
            document.getElementById('modalAdd').style.display='none';
            refresh();
        }

        async function retirar(id) {
            const qtd = prompt("Quantidade para saída:");
            if(qtd && !isNaN(qtd)) {
                const res = await fetch('/api/estoque/retirar', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, qtd}) });
                if(!res.ok) alert("Erro: Verifique o saldo disponível");
                refresh();
            }
        }

        async function deleteItem(id) {
            if(confirm("Deseja apagar permanentemente este item?")) {
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
app.listen(3000, () => console.log('Aura uCore SaaS [V2]: http://localhost:3000'));
