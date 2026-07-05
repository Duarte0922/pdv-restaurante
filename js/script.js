// 1. Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, remove, push, get, query, orderByChild, equalTo, onChildAdded } 
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, setPersistence, browserLocalPersistence } 
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// 2. Configuração e Inicialização
const FB = {
  apiKey: "AIzaSyAXMDwp1-VT3FdBMHkihTPESWL8smJLZcc",
  authDomain: "pdv-restaurante-a7b75.firebaseapp.com",
  databaseURL: "https://pdv-restaurante-a7b75-default-rtdb.firebaseio.com",
  projectId: "pdv-restaurante-a7b75",
  storageBucket: "pdv-restaurante-a7b75.firebasestorage.app",
  messagingSenderId: "262025117951",
  appId: "1:262025117951:web:384a6ec2567d8a231bccca"
};

const app = initializeApp(FB);
const db = getDatabase(app);
const auth = getAuth(app);

// 3. Configura Persistência (Lembrar login)
setPersistence(auth, browserLocalPersistence);

// 4. Lógica de Login e Monitoramento
window.fazerLogin = function(tipo) {
    const email = tipo === 'garcom' ? 'garcom@luar.com' : 'caixa@luar.com';
    const senha = '123456'; 

    signInWithEmailAndPassword(auth, email, senha)
        .then(() => console.log("Conectado como " + tipo))
        .catch((error) => alert("Erro ao conectar: " + error.message));
};

onAuthStateChanged(auth, (user) => {
    const appElement = document.getElementById('app');
    const loginScreen = document.getElementById('login-screen');

    if (user) {
        // Login automático se a sessão persistir
        if(appElement) appElement.style.display = 'flex';
        if(loginScreen) loginScreen.style.display = 'none';
    } else {
        if(appElement) appElement.style.display = 'none';
        if(loginScreen) loginScreen.style.display = 'flex';
    }
});

// 5. Seus Utilitários
const fmt=v=>'R$ '+Number(v).toFixed(2).replace('.',',');
const nomePag=p=>({dinheiro:'Dinheiro',cartao:'Cartão',pix:'Pix'}[p]||'—');
const iconePag=p=>({dinheiro:'💵',cartao:'💳',pix:'📲'}[p]||'❓');
const corPag=p=>({dinheiro:'#2fb36d',cartao:'#5e96ff',pix:'#c89a2a'}[p]||'#acb5ac');
const abrirModal=id=>document.getElementById(id).classList.add('open');
const fecharModal=id=>document.getElementById(id).classList.remove('open');
window.fecharModal=fecharModal;

// ── CLIENTES / ENDEREÇOS (delivery e telefone) ────────────────────
function normalizarTel(t){ return (t||'').replace(/\D/g,''); }
function carregarClientesDB(){
  try{ return JSON.parse(localStorage.getItem('clientes')||'{}'); }
  catch{ return {}; }
}
function salvarClientesDB(db){ localStorage.setItem('clientes', JSON.stringify(db)); }
function buscarCliente(tel){
  const key=normalizarTel(tel);
  if(!key) return null;
  const db=carregarClientesDB();
  return db[key]||null;
}
window.buscarCliente=buscarCliente;
// Salva/atualiza o cliente e (se informado) adiciona ou atualiza um endereço
function salvarOuAtualizarCliente({nome,telefone,endereco}){
  const key=normalizarTel(telefone);
  if(!key) return null;
  const db=carregarClientesDB();
  if(!db[key]) db[key]={nome,telefone,enderecos:[]};
  if(nome) db[key].nome=nome;
  db[key].telefone=telefone;
  if(endereco && endereco.endereco){
    const norm=endereco.endereco.trim().toLowerCase();
    let existente=db[key].enderecos.find(e=>e.endereco.trim().toLowerCase()===norm);
    if(existente){
      existente.label=endereco.label||existente.label;
      if(endereco.km) existente.km=endereco.km;
      if(endereco.taxa) existente.taxa=endereco.taxa;
    }else{
      db[key].enderecos.push({
        id:'E'+Date.now(),
        label:endereco.label||('Endereço '+(db[key].enderecos.length+1)),
        endereco:endereco.endereco,
        km:endereco.km||0,
        taxa:endereco.taxa||0
      });
    }
  }
  salvarClientesDB(db);
  return db[key];
}

// Guarda o pedido (itens) no histórico do cliente, pra sugerir "pedir de novo" da próxima vez.
// Mantém os 8 pedidos mais recentes, mais recente primeiro.
function salvarPedidoHistoricoCliente(telefone, itens, total){
  const key=normalizarTel(telefone);
  if(!key || !itens || !itens.length) return;
  const db=carregarClientesDB();
  if(!db[key]) return;
  if(!db[key].pedidos) db[key].pedidos=[];
  db[key].pedidos.unshift({
    data: Date.now(),
    itens: itens.map(it=>({nome:it.nome, preco:it.preco, qtd:it.qtd})),
    total
  });
  db[key].pedidos = db[key].pedidos.slice(0,8);
  salvarClientesDB(db);
}
window.salvarPedidoHistoricoCliente = salvarPedidoHistoricoCliente;

let mesas=[];
let caixaHoje={dinheiro:0,cartao:0,pix:0,taxa:0,vendas:{}};
const hoje=new Date().toLocaleDateString('pt-BR').replace(/\//g,'-');

// Define data padrão no input de relatório
document.getElementById('data-relatorio').value=new Date().toISOString().slice(0,10);
document.getElementById('caixa-data-hoje').textContent='Caixa — '+new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});

// ── ABAS ─────────────────────────────────────────────────────────
window.mudarAba=function(aba){
  document.querySelectorAll('.aba').forEach((el,i)=>{
    const nomes=['mesas','caixa','relatorio','precos'];
    el.classList.toggle('ativa',nomes[i]===aba);
  });
  document.querySelectorAll('.aba-content').forEach(el=>el.classList.remove('ativa'));
  document.getElementById('aba-'+aba).classList.add('ativa');
  if(aba==='precos') carregarProdutosPrecos();
};

// ── MESAS (visão caixa) ───────────────────────────────────────────
function renderMesasCaixa(){
  const grid=document.getElementById('mesasGridNovo') || document.getElementById('caixa-mesa-grid');
  grid.innerHTML='';
  let liv=0,ocu=0,con=0;
  mesas.filter(m=>!m.virtual).forEach(m=>{
    if(m.status==='livre')liv++;
    else if(m.status==='ocupada')ocu++;
    else con++;
    const cor=m.status==='livre'?'#2f9d64':m.status==='ocupada'?'#cf5b74':'#c89a2a';
    const bg=m.status==='livre'?'linear-gradient(180deg,#edf8f0,#e0f5e6)':m.status==='ocupada'?'linear-gradient(180deg,#fff0f3,#ffe6ea)':'linear-gradient(180deg,#fff8e8,#fff2d2)';
    const total=(m.pedido||[]).reduce((s,i)=>s+i.preco*i.qtd,0);
    const el=document.createElement('div');
    el.className='caixa-mesa-card';
    el.style.cssText=`background:${bg};border-color:${cor};`;
    el.innerHTML=`<div style="font-size:13px;font-weight:700;color:${cor};">Mesa ${String(m.id).padStart(2,'0')}</div>
      <div style="font-size:10px;color:${cor};margin:2px 0;">${m.status==='livre'?'Livre':m.status==='ocupada'?'Ocupada':'Conta'}</div>
      ${total>0?`<div style="font-size:12px;font-weight:700;color:${cor};">${fmt(total)}</div>`:''}`;
    el.onclick=()=>abrirMesaCx(m.id);
    grid.appendChild(el);
  });
  document.getElementById('c-stat-livre').textContent=liv+' livres';
  document.getElementById('c-stat-ocup').textContent=ocu+' ocupadas';
  document.getElementById('c-stat-conta').textContent=con+' conta';
}

function verDetalhesMesa(m){
  document.getElementById('modal-mesa-titulo').textContent='Mesa '+String(m.id).padStart(2,'0')+' — '+
    (m.status==='livre'?'Livre':m.status==='ocupada'?'Ocupada':'Conta solicitada');
  const pedido=m.pedido||[];
  if(!pedido.length){
    document.getElementById('modal-mesa-conteudo').innerHTML='<p style="color:var(--txt2);font-size:13px;">Mesa vazia.</p>';
  }else{
    const total=pedido.reduce((s,i)=>s+i.preco*i.qtd,0);
    document.getElementById('modal-mesa-conteudo').innerHTML=
      pedido.map(it=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--border2);">
        <span>${it.qtd}x ${it.nome}${it.obs?` <em style="font-size:11px;color:var(--txt2);">(${it.obs})</em>`:''}</span>
        <span style="font-weight:600;">${fmt(it.preco*it.qtd)}</span>
      </div>`).join('')+
      `<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;padding:10px 0;color:var(--verde);">
        <span>Total</span><span>${fmt(total)}</span>
      </div>`;
  }
  abrirModal('modal-mesa-detalhe');
}

// ── CAIXA HOJE ───────────────────────────────────────────────────
function labelOrigemVenda(v){
  if(v.canal==='delivery') return '📱 '+(v.cliente||'Delivery');
  if(v.canal==='telefone') return '📞 '+(v.cliente||'Telefone');
  if(v.canal==='balcao') return '🍽️ Balcão '+String(v.mesa).replace('B','');
  return 'Mesa '+String(v.mesa).padStart(2,'0');
}

// Agrupa as vendas do dia em: Zap (whatsapp), Telefone, e Mesas+Balcão (juntos)
function agruparVendasPorCanal(vendas){
  const grupos = {
    zap:      {label:'📱 Zap (WhatsApp)', dinheiro:0, cartao:0, pix:0, taxa:0, qtd:0, total:0},
    telefone: {label:'📞 Telefone',       dinheiro:0, cartao:0, pix:0, taxa:0, qtd:0, total:0},
    salao:    {label:'🍽️ Mesas + Balcão', dinheiro:0, cartao:0, pix:0, taxa:0, qtd:0, total:0},
  };
  vendas.forEach(v=>{
    const g = v.canal==='delivery' ? grupos.zap : v.canal==='telefone' ? grupos.telefone : grupos.salao;
    g.qtd++;
    g.total += v.total||0;
    g.taxa += v.taxa||0;
    (v.pagamentos||[]).forEach(p=>{ if(g[p.tipo]!==undefined) g[p.tipo]+=(p.valor||0); });
  });
  return grupos;
}

function renderGruposCanalHTML(vendas){
  const grupos = agruparVendasPorCanal(vendas);
  return Object.values(grupos).map(g=>`
    <div style="background:rgba(20,26,21,.96);border:1px solid var(--border2);border-radius:var(--rad-lg);padding:10px 14px;margin-bottom:8px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px;">${g.label} <span style="color:var(--txt2);font-weight:400;">— ${g.qtd} pedido${g.qtd===1?'':'s'} · ${fmt(g.total)}</span></div>
      <div class="totais-grid">
        <div class="total-card"><div class="total-label">💵 Dinheiro</div><div class="total-valor" style="color:#2fb36d;">${fmt(g.dinheiro)}</div></div>
        <div class="total-card"><div class="total-label">💳 Cartão</div><div class="total-valor" style="color:#5e96ff;">${fmt(g.cartao)}</div></div>
        <div class="total-card"><div class="total-label">📲 Pix</div><div class="total-valor" style="color:#c89a2a;">${fmt(g.pix)}</div></div>
        <div class="total-card"><div class="total-label">🛵 Taxa</div><div class="total-valor" style="color:#c89a2a;">${fmt(g.taxa)}</div></div>
      </div>
    </div>`).join('');
}

function renderCaixaHoje(c){
  const vendas=c.vendas?Object.values(c.vendas):[];
  const total=(c.dinheiro||0)+(c.cartao||0)+(c.pix||0);
  document.getElementById('caixa-total-hoje').textContent=fmt(total);
  document.getElementById('caixa-qtd-hoje').textContent=vendas.length+' vendas';
  document.getElementById('caixa-totais-hoje').innerHTML=[
    {label:'💵 Dinheiro',val:c.dinheiro||0,cor:'#2fb36d'},
    {label:'💳 Cartão',val:c.cartao||0,cor:'#5e96ff'},
    {label:'📲 Pix',val:c.pix||0,cor:'#c89a2a'},
    {label:'🛵 Taxa',val:c.taxa||0,cor:'#c89a2a'},
    {label:'📦 Vendas',val:vendas.length,cor:'#acb5ac',qtd:true},
  ].map(x=>`<div class="total-card">
    <div class="total-label">${x.label}</div>
    <div class="total-valor" style="color:${x.cor};">${x.qtd?x.val:fmt(x.val)}</div>
  </div>`).join('');
  document.getElementById('caixa-canais-hoje').innerHTML = renderGruposCanalHTML(vendas);
  const hist=document.getElementById('caixa-historico-hoje');
  if(!vendas.length){hist.innerHTML='<div style="text-align:center;padding:20px;color:var(--txt2);font-size:13px;">Nenhuma venda hoje</div>';return;}
  hist.innerHTML=vendas.slice().reverse().map(v=>`<div class="venda-item">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:13px;font-weight:700;">${labelOrigemVenda(v)}</span>
        <span style="font-size:11px;color:var(--txt2);">${v.hora}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span>${iconePag(v.pagamento)}</span>
        <span style="font-size:14px;font-weight:700;color:${corPag(v.pagamento)};">${fmt(v.total)}</span>
      </div>
    </div>
    <div style="font-size:11px;color:var(--txt2);">${(v.itens||[]).slice(0,3).map(it=>it.qtd+'x '+it.nome).join(', ')+((v.itens||[]).length>3?' +mais...':'')}${v.taxa?' · 🛵 Taxa '+fmt(v.taxa):''}</div>
  </div>`).join('');
}

// ── RELATÓRIO POR DATA ───────────────────────────────────────────
window.carregarRelatorio=async function(){
  const inputVal=document.getElementById('data-relatorio').value;
  if(!inputVal){alert('Selecione uma data.');return;}
  const [ano,mes,dia]=inputVal.split('-');
  const dataFB=`${dia}-${mes}-${ano}`;
  document.getElementById('relatorio-resultado').innerHTML='<div style="text-align:center;padding:30px;color:var(--txt2);">Carregando...</div>';
  try{
    const snap=await get(ref(db,`caixa/${dataFB}`));
    const dados=snap.val();
    if(!dados){
      document.getElementById('relatorio-resultado').innerHTML='<div style="text-align:center;padding:40px;color:var(--txt2);">Nenhum dado encontrado para esta data.</div>';
      return;
    }
    const vendas=dados.vendas?Object.values(dados.vendas):[];
    const total=(dados.dinheiro||0)+(dados.cartao||0)+(dados.pix||0);
    const dataFormatada=`${dia}/${mes}/${ano}`;
    document.getElementById('relatorio-resultado').innerHTML=`
      <div style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--verde);">📅 ${dataFormatada}</div>
      <div class="totais-grid" style="margin-bottom:10px;">
        ${[
          {label:'💵 Dinheiro',val:dados.dinheiro||0,cor:'#2fb36d'},
          {label:'💳 Cartão',val:dados.cartao||0,cor:'#5e96ff'},
          {label:'📲 Pix',val:dados.pix||0,cor:'#c89a2a'},
          {label:'🛵 Taxa',val:dados.taxa||0,cor:'#c89a2a'},
          {label:'📦 Vendas',val:vendas.length,cor:'#acb5ac',qtd:true},
        ].map(x=>`<div class="total-card">
          <div class="total-label">${x.label}</div>
          <div class="total-valor" style="color:${x.cor};">${x.qtd?x.val:fmt(x.val)}</div>
        </div>`).join('')}
      </div>
      <div style="margin-bottom:10px;">${renderGruposCanalHTML(vendas)}</div>
      <div style="background:linear-gradient(180deg,#1a2e1e,#111912);border:1px solid #2a4a30;border-radius:var(--rad-lg);padding:14px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-size:14px;font-weight:600;color:#8ecfaa;">Total do Dia</span>
        <span style="font-size:26px;font-weight:700;color:var(--verde);">${fmt(total)}</span>
      </div>
      <div style="background:rgba(20,26,21,.96);border:1px solid var(--border2);border-radius:var(--rad-lg);overflow:hidden;">
        <div style="padding:10px 14px;border-bottom:1px solid var(--border2);font-size:13px;font-weight:600;">Vendas do dia</div>
        <div style="padding:6px 8px;">
          ${!vendas.length?'<div style="text-align:center;padding:16px;color:var(--txt2);font-size:13px;">Nenhuma venda</div>':
          vendas.slice().reverse().map(v=>`<div class="venda-item">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:13px;font-weight:700;">${labelOrigemVenda(v)}</span>
                <span style="font-size:11px;color:var(--txt2);">${v.hora}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span>${iconePag(v.pagamento)}</span>
                <span style="font-size:14px;font-weight:700;color:${corPag(v.pagamento)};">${fmt(v.total)}</span>
              </div>
            </div>
            <div style="font-size:11px;color:var(--txt2);">${(v.itens||[]).map(it=>it.qtd+'x '+it.nome).join(', ')}${v.taxa?' · 🛵 Taxa '+fmt(v.taxa):''}</div>
          </div>`).join('')}
        </div>
      </div>`;
  }catch(e){
    document.getElementById('relatorio-resultado').innerHTML='<div style="text-align:center;padding:40px;color:#ff8080;">Erro ao carregar. Verifique a conexão.</div>';
  }
};

window.imprimirRelatorio=function(){
  const inputVal=document.getElementById('data-relatorio').value;
  const conteudo=document.getElementById('relatorio-resultado').innerHTML;
  if(conteudo.includes('Selecione')){ alert('Busque os dados primeiro.'); return; }
  const [ano,mes,dia]=inputVal.split('-');
  const popup=window.open('','_blank','width=480,height=700');
  if(!popup){alert('Libere pop-ups.');return;}
  popup.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório ${dia}/${mes}/${ano}</title>
  <style>body{font-family:Arial,sans-serif;margin:0;padding:18px;color:#000;}
  .totais-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;}
  .total-card{border:1px solid #ccc;border-radius:8px;padding:10px;text-align:center;}
  .total-label{font-size:11px;color:#555;margin-bottom:4px;}
  .total-valor{font-size:18px;font-weight:bold;}
  .venda-item{border:1px solid #ddd;border-radius:8px;padding:8px 10px;margin-bottom:6px;}
  @media print{button{display:none;}}</style></head><body>
  <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:12px;margin-bottom:14px;">
    <div style="font-size:20px;font-weight:bold;">🌙 LUAR DO VIENA</div>
    <div style="font-size:14px;font-weight:bold;margin-top:4px;">RELATÓRIO DE CAIXA</div>
    <div style="font-size:12px;margin-top:4px;">${dia}/${mes}/${ano}</div>
  </div>
  ${conteudo}
  </body></html>`);
  popup.document.close();
  setTimeout(()=>{popup.print();popup.close();},400);
};

// ── IMPRESSÃO AUTOMÁTICA (monitor) ───────────────────────────────
function tocarBeep(){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    [0,180,360].forEach(d=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);
      o.frequency.value=880;
      g.gain.setValueAtTime(0.3,ctx.currentTime+d/1000);
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+d/1000+0.15);
      o.start(ctx.currentTime+d/1000);o.stop(ctx.currentTime+d/1000+0.15);
    });
  }catch{}
}

// ── TOAST DE ALERTA (sucesso/erro) usado em várias telas ─────────
function mostrarAlerta(msg, cor){
  const div = document.createElement('div');
  div.className = 'toast-msg toast-'+(cor==='vermelho' ? 'vermelho' : 'verde');
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(()=>{
    div.classList.add('toast-saindo');
    setTimeout(()=>div.remove(), 300);
  }, 3000);
}
window.mostrarAlerta = mostrarAlerta;

function criarAlerta(titulo,subtitulo,itensHtml,onImprimir){
  tocarBeep();
  const div=document.createElement('div');
  div.className='alerta';
  const uid='btn-al-'+Date.now();
  div.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
    <div class="alerta-titulo">${titulo}</div>
    <button class="btn-fechar-alerta" style="background:#3a1a1a;border:1px solid #cc3333;border-radius:8px;color:#ff8080;font-size:16px;font-weight:700;cursor:pointer;padding:2px 8px;line-height:1;flex-shrink:0;margin-left:8px;" title="Fechar sem imprimir">✕</button>
  </div>
    <div class="alerta-sub">${subtitulo}</div>
    <div class="alerta-itens">${itensHtml}</div>
    <button class="btn-imprimir-alerta" style="width:100%;padding:10px;background:linear-gradient(180deg,#2aa160,#1d7b49);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">🖨 IMPRIMIR</button>`;
  document.getElementById('alertas-container').appendChild(div);
  div.querySelector('.btn-fechar-alerta').onclick=()=>div.remove();
  div.querySelector('.btn-imprimir-alerta').onclick=function(){
    this.disabled=true;this.textContent='Imprimindo...';
    onImprimir();
    setTimeout(()=>div.remove(),600);
  };
}

function imprimirComanda(pedido){
  const popup=window.open('','_blank','width=420,height=580');
  if(!popup)return;
  const linhas=pedido.itens.map(it=>`<div style="padding:8px 0;border-bottom:1px dashed #ccc;">
    <div style="display:flex;justify-content:space-between;"><strong style="font-size:15px;">${it.qtd}x ${it.nome}</strong><span>${fmt(it.preco*it.qtd)}</span></div>
    ${it.obs?`<div style="font-size:12px;color:#555;">→ ${it.obs}</div>`:''}
    <div style="font-size:10px;color:#777;text-transform:uppercase;">${it.setor||''}</div>
  </div>`).join('');
  popup.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Cozinha Mesa ${String(pedido.mesa).padStart(2,'0')}</title>
  <style>body{font-family:Arial,sans-serif;margin:0;padding:16px;color:#000;}@media print{button{display:none;}}</style></head><body>
  <div style="max-width:300px;margin:0 auto;">
    <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:10px;margin-bottom:12px;">
      <div style="font-size:22px;font-weight:bold;">COMANDA</div>
      <div style="font-size:18px;font-weight:bold;margin-top:6px;">Mesa ${String(pedido.mesa).padStart(2,'0')}</div>
      <div style="font-size:12px;margin-top:4px;">${pedido.data}</div>
      <div style="font-size:11px;">#${pedido.codigo}</div>
    </div>
    ${linhas}
    <div style="margin-top:14px;text-align:center;font-size:11px;border-top:2px dashed #000;padding-top:10px;">🌙 Luar do Viena</div>
  </div></body></html>`);
  popup.document.close();
  setTimeout(()=>{popup.print();popup.close();},400);
}

function imprimirContaMesa(dados){
  const itens=dados.itens||[];
  const sub=itens.reduce((s,i)=>s+i.preco*i.qtd,0);
  const desc=dados.desconto||0;
  const total=sub-(sub*(desc/100));
  const popup=window.open('','_blank','width=420,height=620');
  if(!popup)return;
  popup.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Conta Mesa ${String(dados.mesa).padStart(2,'0')}</title>
  <style>body{font-family:Arial,sans-serif;margin:0;padding:18px;color:#000;}table{width:100%;border-collapse:collapse;}@media print{button{display:none;}}</style></head><body>
  <div style="max-width:320px;margin:0 auto;">
    <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:12px;margin-bottom:14px;">
      <div style="font-size:22px;font-weight:bold;">🌙 LUAR DO VIENA</div>
      <div style="font-size:13px;margin-top:4px;">Mesa ${String(dados.mesa).padStart(2,'0')} · ${dados.data}</div>
    </div>
    <table>
      <tbody>${itens.map(it=>`<tr><td style="padding:5px 0;">${it.qtd}x ${it.nome}${it.obs?' ('+it.obs+')':''}</td><td style="text-align:right;font-weight:bold;">${fmt(it.preco*it.qtd)}</td></tr>`).join('')}</tbody>
    </table>
    <div style="border-top:1px dashed #000;margin-top:12px;padding-top:10px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Subtotal</span><strong>${fmt(sub)}</strong></div>
      ${desc?`<div style="display:flex;justify-content:space-between;margin-bottom:4px;color:#555;"><span>Desconto (${desc}%)</span><span>-${fmt(sub*(desc/100))}</span></div>`:''}
      <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:bold;margin-top:8px;"><span>TOTAL</span><span>${fmt(total)}</span></div>
      ${dados.pagamento?`<div style="margin-top:8px;font-size:12px;color:#555;">Pagamento: ${nomePag(dados.pagamento)}</div>`:''}
    </div>
    <div style="text-align:center;margin-top:16px;font-size:11px;border-top:2px dashed #000;padding-top:10px;">Obrigado pela visita! 🌙</div>
  </div></body></html>`);
  popup.document.close();
  setTimeout(()=>{popup.print();popup.close();},400);
}

// Timestamp de início da sessão — ignora tudo que chegou ANTES de abrir o caixa
const SESSAO_INICIO = Date.now();

// Escuta pedidos cozinha pendentes
onChildAdded(query(ref(db,'pedidos_cozinha'),orderByChild('status'),equalTo('pendente')),(snap)=>{
  const p=snap.val();const id=snap.key;
  // Ignora registros antigos (anteriores à abertura desta sessão)
  if(!p.timestamp || p.timestamp < SESSAO_INICIO) return;
  const itensHtml=p.itens.map(it=>`<div>• <strong>${it.qtd}x ${it.nome}</strong>${it.obs?` (${it.obs})`:''}  <small style="color:var(--txt2);">[${it.setor||''}]</small></div>`).join('');
  criarAlerta(`🔔 MESA ${String(p.mesa).padStart(2,'0')} — COZINHA`,p.data+' · #'+p.codigo,itensHtml,()=>{
    imprimirComanda(p);
    update(ref(db,'pedidos_cozinha/'+id),{status:'impresso',impressoEm:Date.now()});
  });
});

// Escuta contas para imprimir
onChildAdded(query(ref(db,'contas_imprimir'),orderByChild('status'),equalTo('pendente')),(snap)=>{
  const d=snap.val();const id=snap.key;
  // Ignora registros antigos (anteriores à abertura desta sessão)
  if(!d.timestamp || d.timestamp < SESSAO_INICIO) return;
  const total=(d.itens||[]).reduce((s,i)=>s+i.preco*i.qtd,0);
  criarAlerta(`🧾 CONTA MESA ${String(d.mesa).padStart(2,'0')}`,`Total: ${fmt(total)}`,`Pagamento: ${nomePag(d.pagamento)||'?'}`,()=>{
    imprimirContaMesa(d);
    update(ref(db,'contas_imprimir/'+id),{status:'impresso',impressoEm:Date.now()});
  });
});

// ── CONFIGURAÇÕES ─────────────────────────────────────────────────
window.abrirConfig=function(){
  get(ref(db,'config/numMesas')).then(s=>{
    document.getElementById('input-num-mesas').value=s.val()||16;
    abrirModal('modal-config');
  });
};

window.salvarConfig=async function(){
  const n=parseInt(document.getElementById('input-num-mesas').value)||16;
  await set(ref(db,'config/numMesas'),n);
  fecharModal('modal-config');
  alert('✓ Número de mesas atualizado para '+n+'. O tablet será atualizado automaticamente!');
};

// ── FECHAR CAIXA — estado interno ────────────────────────────────
let fcTipo = null;      // 'total' | 'parcial'
let fcPagamento = null; // 'pix' | 'cartao' | 'dinheiro'

window.confirmarFecharCaixa = () => {
  resetFechamentoCaixa();
  abrirModal('modal-fechar-caixa');
};

// ── CONTROLE DE FECHAMENTO ──
window.resetFechamentoCaixa = function(){
  fcTipo = null; fcPagamento = null;
  ['total','parcial'].forEach(t => {
    const el = document.getElementById('btn-tipo-'+t);
    if(el){ el.style.borderColor = t==='total' ? 'var(--verde)' : 'var(--border3)';
            el.style.background  = t==='total' ? 'linear-gradient(180deg,#1a2e1e,#111912)' : 'linear-gradient(180deg,#1f1c0d,#151208)'; }
  });
  ['pix','cartao','dinheiro'].forEach(p => {
    const el = document.getElementById('fc-btn-'+p);
    const bg = p==='pix'?'linear-gradient(180deg,#1f1c0d,#151208)':p==='cartao'?'linear-gradient(180deg,#0f1829,#0a1020)':'linear-gradient(180deg,#0d1f12,#091410)';
    if(el){ el.style.borderColor='var(--border3)'; el.style.background=bg; el.style.opacity='1'; }
  });
  const parcEl = document.getElementById('fc-parcial-valor');
  if(parcEl) parcEl.style.display='none';
  const resumoEl = document.getElementById('fc-resumo');
  if(resumoEl) resumoEl.style.display='none';
  const confirmBtn = document.getElementById('btn-confirmar-fechamento-caixa');
  if(confirmBtn){ confirmBtn.style.opacity='0.4'; confirmBtn.style.pointerEvents='none'; }
  const inp = document.getElementById('fc-valor-parcial');
  if(inp) inp.value='';
};

window.selecionarTipoFechamento = function(tipo){
  fcTipo = tipo;
  const estilos = {
    total:   {border:'var(--verde)',   bg:'linear-gradient(180deg,#1a2e1e,#111912)'},
    parcial: {border:'#c89a2a',        bg:'linear-gradient(180deg,#2e2208,#1a1305)'},
  };
  ['total','parcial'].forEach(t => {
    const el = document.getElementById('btn-tipo-'+t);
    if(!el) return;
    const s = estilos[t];
    el.style.borderColor = t===tipo ? s.border : 'var(--border3)';
    el.style.background  = t===tipo ? s.bg : (t==='total'?'linear-gradient(180deg,#1a2e1e,#111912)':'linear-gradient(180deg,#1f1c0d,#151208)');
    el.style.opacity     = t===tipo ? '1' : '0.6';
  });
  const parcEl = document.getElementById('fc-parcial-valor');
  if(parcEl) parcEl.style.display = tipo==='parcial' ? 'block' : 'none';
  atualizarResumoFC();
};

window.togglePagFC = function(pag){
  fcPagamento = fcPagamento===pag ? null : pag;
  const cores = {pix:'#c89a2a', cartao:'#5e96ff', dinheiro:'var(--verde)'};
  const bgs   = {pix:'linear-gradient(180deg,#1f1c0d,#151208)', cartao:'linear-gradient(180deg,#0f1829,#0a1020)', dinheiro:'linear-gradient(180deg,#0d1f12,#091410)'};
  ['pix','cartao','dinheiro'].forEach(p => {
    const el = document.getElementById('fc-btn-'+p);
    if(!el) return;
    const ativo = p===fcPagamento;
    el.style.borderColor = ativo ? cores[p] : 'var(--border3)';
    el.style.background  = ativo ? bgs[p].replace('0d1f','1a2e').replace('0f1829','1b3158').replace('1f1c0d','2e2208') : bgs[p];
    el.style.opacity     = ativo ? '1' : '0.55';
  });
  atualizarResumoFC();
};

function atualizarResumoFC(){
  const resumoEl = document.getElementById('fc-resumo');
  const resumoTxt = document.getElementById('fc-resumo-texto');
  const confirmBtn = document.getElementById('btn-confirmar-fechamento-caixa');
  if(!resumoEl||!confirmBtn) return;
  const nomesPag = {pix:'📲 Pix', cartao:'💳 Cartão', dinheiro:'💵 Dinheiro'};
  const nomesTipo = {total:'💰 Total', parcial:'🧾 Parcial'};
  const pronto = fcTipo && fcPagamento;
  resumoEl.style.display = pronto ? 'block' : 'none';
  if(pronto && resumoTxt){
    let txt = nomesTipo[fcTipo]+' · '+nomesPag[fcPagamento];
    if(fcTipo==='parcial'){
      const v = parseFloat(document.getElementById('fc-valor-parcial').value)||0;
      txt += v>0?' · R$ '+v.toFixed(2).replace('.',','):'';
    }
    resumoTxt.textContent = txt;
  }
  confirmBtn.style.opacity = pronto ? '1' : '0.4';
  confirmBtn.style.pointerEvents = pronto ? 'auto' : 'none';
}

window.confirmarFechamentoCaixa = async function(){
  if(!fcTipo||!fcPagamento){alert('Selecione tipo e forma de pagamento.');return;}
  if(fcTipo==='parcial'){
    const v=parseFloat(document.getElementById('fc-valor-parcial').value)||0;
    if(v<=0){alert('Informe um valor parcial maior que zero.');return;}
    const chave='p'+Date.now();
    try{
      await update(ref(db,'caixa/'+hoje),{[fcPagamento]:(caixaHoje[fcPagamento]||0)+v});
      await set(ref(db,'caixa/'+hoje+'/sangrias/'+chave),{tipo:fcPagamento,valor:v,hora:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),obs:'Parcial'});
    }catch(e){alert('Erro ao registrar. Verifique a conexão.');}
    fecharModal('modal-fechar-caixa');
    resetFechamentoCaixa();
    alert('✓ Entrada parcial registrada!');
  } else {
    if(!confirm('Fechar o caixa do dia? Um relatório será aberto para impressão/PDF antes de zerar.')) return;
    window.imprimirCaixaHoje(); // gera o relatório (pode salvar como PDF na janela de impressão)
    try{await remove(ref(db,'caixa/'+hoje));}catch{}
    fecharModal('modal-fechar-caixa');
    resetFechamentoCaixa();
    renderCaixaHoje({dinheiro:0,cartao:0,pix:0,taxa:0,vendas:{}});
    alert('✓ Caixa fechado com sucesso!');
  }
};

window.imprimirCaixaHoje=function(){
  const c=caixaHoje;
  const vendas=c.vendas?Object.values(c.vendas):[];
  const total=(c.dinheiro||0)+(c.cartao||0)+(c.pix||0);
  const grupos=agruparVendasPorCanal(vendas);
  const popup=window.open('','_blank','width=480,height=700');
  if(!popup){alert('Libere pop-ups.');return;}
  popup.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Caixa ${hoje}</title>
  <style>body{font-family:Arial,sans-serif;margin:0;padding:18px;color:#000;}table{width:100%;border-collapse:collapse;}th,td{padding:5px 4px;font-size:12px;}th{border-bottom:1px solid #ccc;font-size:11px;color:#555;}@media print{button{display:none;}}</style></head><body>
  <div style="max-width:420px;margin:0 auto;">
    <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:12px;margin-bottom:14px;">
      <div style="font-size:20px;font-weight:bold;">🌙 LUAR DO VIENA</div>
      <div style="font-size:15px;font-weight:bold;margin-top:4px;">FECHAMENTO DE CAIXA</div>
      <div style="font-size:12px;margin-top:4px;">${new Date().toLocaleString('pt-BR')}</div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;"><span>💵 Dinheiro</span><strong>${fmt(c.dinheiro||0)}</strong></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;"><span>💳 Cartão</span><strong>${fmt(c.cartao||0)}</strong></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;"><span>📲 Pix</span><strong>${fmt(c.pix||0)}</strong></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:14px;"><span>🛵 Taxa de entrega</span><strong>${fmt(c.taxa||0)}</strong></div>
    <div style="display:flex;justify-content:space-between;border-top:2px solid #000;padding-top:10px;margin-bottom:16px;font-size:18px;font-weight:bold;"><span>TOTAL GERAL</span><span>${fmt(total)}</span></div>
    ${Object.values(grupos).map(g=>`
      <div style="border:1px solid #ccc;border-radius:6px;padding:8px 10px;margin-bottom:8px;">
        <div style="font-weight:bold;font-size:13px;margin-bottom:4px;">${g.label} — ${g.qtd} pedido${g.qtd===1?'':'s'}</div>
        <div style="font-size:11px;">💵 ${fmt(g.dinheiro)} · 💳 ${fmt(g.cartao)} · 📲 ${fmt(g.pix)} · 🛵 ${fmt(g.taxa)}</div>
      </div>`).join('')}
    <table><thead><tr><th>Hora</th><th>Pedido</th><th>Pagto</th><th style="text-align:right;">Total</th></tr></thead>
    <tbody>${vendas.map(v=>`<tr><td>${v.hora}</td><td>${labelOrigemVenda(v)}</td><td style="text-align:center;">${nomePag(v.pagamento)}</td><td style="text-align:right;font-weight:bold;">${fmt(v.total)}</td></tr>`).join('')}</tbody></table>
    <div style="text-align:center;margin-top:16px;font-size:11px;border-top:2px dashed #000;padding-top:10px;">${vendas.length} vendas · Use "Salvar como PDF" na janela de impressão · Obrigado!</div>
  </div></body></html>`);
  popup.document.close();
  setTimeout(()=>{popup.print();},400);
};

// ── FIREBASE SYNC (VERSÃO FINAL ÚNICA) ────────────────────────

// 1. Monitor de Configuração (Número de Mesas)
onValue(ref(db, 'config/numMesas'), (snap) => {
  const n = snap.val() || 16;
  const atuais = mesas.filter(m=>!m.virtual);
  if (n !== atuais.length) {
    console.log("Sincronizando número de mesas para: " + n);
    const virtuais = mesas.filter(m=>m.virtual);
    mesas = Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      status: 'livre',
      inicio: null,
      pedido: []
    })).concat(virtuais);
    renderMesasCaixa();
  }
});

// 2. Monitor de Dados das Mesas (Ocupação e Pedidos)
onValue(ref(db, 'mesas'), (snap) => {
  const dados = snap.val();
  if (!dados) return;
  Object.values(dados).forEach(m => {
    const local = mesas.find(x => x.id === m.id);
    if (local) {
      local.status = m.status || 'livre';
      local.inicio = m.inicio || null;
      local.pedido = m.pedido ? Object.values(m.pedido) : [];
    }
  });
  renderMesasCaixa();
});

// 3. Monitor do Caixa do Dia (Financeiro)
onValue(ref(db, 'caixa/' + hoje), (snap) => {
  const dados = snap.val() || { dinheiro: 0, cartao: 0, pix: 0, vendas: {} };
  caixaHoje = dados;
  renderCaixaHoje(dados);
});

// 4. Monitor de Status da Conexão (Badge Online)
onValue(ref(db, '.info/connected'), (snap) => {
  const el = document.getElementById('sync-indicator');
  const on = !!snap.val();
  if (el) {
    el.textContent = on ? '● Online' : '○ Offline';
    el.style.background = on ? 'var(--verde-bg)' : '#3a1a1a';
    el.style.color = on ? 'var(--verde)' : '#ff8080';
  }
});



// ══════════════════════════════════════════════
// CAIXA — FUNÇÕES DO GARÇOM (PEDIDO POR MESA)
// ══════════════════════════════════════════════


const BORDAS_CX = { 'Catupiry':{M:11,G:13,GG:15}, 'Cheddar/Catupiry':{M:12,G:14,GG:16} };

// Função para gerar nome de arquivo da imagem baseado no nome do produto
function gerarNomeImagem(nome) {
  return nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // converte á,ã,ç etc para a,c...
    .toLowerCase()
    .replace(/[0-9\s-]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Função para gerar caminho da imagem na pasta produtos/
function gerarCaminhoImagemProduto(nomeProduto) {
  const nome = gerarNomeImagem(nomeProduto);
  return `produtos/${nome}.jpg`;
}

// Função para adicionar imagem automaticamente aos produtos (pasta produtos/)
function adicionarImagem(produtos) {
  return produtos.map(p => ({
    ...p,
    img: gerarCaminhoImagemProduto(p.nome)
  }));
}

// PIZZAS
const pizzasTradCx = [
  '01 - Frango c/ Catupiry','02 - Palmito á Bolonhesa','03 - Palmito c/ Catupiry',
  '04 - Portuguesa','05 - Napolitana','06 - Calabresa','07 - Mussarela','08 - Á Moda',
  '09 - Frango á Bolonhesa','10 - Presunto','11 - Vegetariana','12 - Bacon','13 - Bacon Milho',
  '14 - Sugestão Renito','15 - Atum','16 - Chef Cheddar','17 - Espanta Vampiro'
].map(n => ({nome:n, tamanhos:{M:40.90, G:52.90, GG:61.90}}));

const pizzasEspCx = [
  '18 - Lombo Tropical','19 - Lombo Canadense','20 - Milhombo','21 - A Moda Renito',
  '22 - Quatro Queijo','23 - Salaminho Italiano','24 - Quatro Carnes','25 - Cinco Carnes',
  '26 - Nordestina','27 - Porconobilis','28 - A Moda Especial'
].map(n => ({nome:n, tamanhos:{M:45.90, G:57.90, GG:76.90}}));

// CATEGORIAS
const categoriasCx = [
  {nome:'Pizza Trad.', icon:'🍕', img:'img/pizza-trad.jpg', pizza:true, produtos: adicionarImagem(pizzasTradCx)},
  {nome:'Pizza Esp.', icon:'🌟', img:'img/pizza-esp.jpg', pizza:true, produtos: adicionarImagem(pizzasEspCx)},
  {nome:'Sanduíches', icon:'🍔', img:'img/sanduiches.jpg', produtos: adicionarImagem([
    {nome:'01 - Hamburguer',preco:10},{nome:'02 - X-Burguer',preco:11},{nome:'03 - Misto Especial',preco:11},
    {nome:'04 - X-Bacon',preco:14},{nome:'05 - Framburguer',preco:14.5},{nome:'06 - X-Egg-Burguer',preco:14.5},
    {nome:'07 - X-Egg-Bacon',preco:16},{nome:'08 - X-Tudo',preco:17},{nome:'09 - Daliane',preco:23.5},
    {nome:'10 - 5 Carnes',preco:24.5},{nome:'11 - X-Tudão',preco:19.5},{nome:'12 - X-Frango',preco:19.5},
    {nome:'13 - Super X-Tudo',preco:24.5},{nome:'14 - RM Sanduíche',preco:25},{nome:'15 - LR Burguer',preco:26.5},
    {nome:'16 - Rangão',preco:28.5},{nome:'17 - Califórnia',preco:22.5},{nome:'18 - X-Bruno',preco:22.5},
    {nome:'19 - Chefe',preco:24.5},{nome:'20 - Patrão',preco:30.5},{nome:'21 - Ki-Frango',preco:24.5},
    {nome:'22 - Dom Geraldo',preco:29.5},{nome:'23 - São Carlos',preco:24.5},{nome:'24 - Dom Cleiton',preco:31.5},
    {nome:'25 - F-Kalll',preco:32.5},{nome:'26 - Marley',preco:25.5},{nome:'27 - Betoven',preco:35.5},
  ])},
  {nome:'Porções', icon:'🍟', img:'img/porcoes.jpg', carne:true, produtos: adicionarImagem([
    {nome:'Fritas 400g Mussarela',preco:24.9},{nome:'Fritas 400g Muss./Bacon',preco:34.9},
    {nome:'Fritas 400g Muss./Bacon/Cala.',preco:49.9},{nome:'Carne de Sol c/ Fritas',preco:75.9},
    {nome:'Contra Filé c/ Fritas',preco:77.9},{nome:'Fígado com Jiló',preco:32.9},
    {nome:'Linguiça Caseira c/ Fritas',preco:55.9},{nome:'Pernil c/ Fritas/Mandioca',preco:55.9},
    {nome:'Arroz na Chapa',preco:24.9},{nome:'Arroz com Pernil',preco:36.9},
    {nome:'Porção Mista',preco:136.9},{nome:'Filé de Peito de Frango',preco:42.9},
    {nome:'Picanha',preco:96.9},{nome:'Costelinha c/ Mandioca',preco:67.9},
    {nome:'Coxinha da Asa 1kg',preco:50.9},
  ])},
  {nome:'Peixes', icon:'🐟', img:'img/peixes.jpg', produtos: adicionarImagem([
    {nome:'Tilápia 400g Molho Especial',preco:53.9},{nome:'Tilápia 400g c/ Batata',preco:68.9},
    {nome:'Cascudo 800g Molho Especial',preco:46.9},{nome:'Cascudo 800g c/ Batata',preco:60.9},
    {nome:'Cascudo 400g Molho Especial',preco:23.9},{nome:'Cascudo 400g c/ Batata',preco:30.9},
  ])},
  {nome:'Bebidas', icon:'🥤', img:'img/bebidas.jpg', produtos: adicionarImagem([
    {nome:'Suco de Caixinha',preco:5,bar:true},{nome:'Suco 1 Litro',preco:12},
    {nome:'Polpa Acerola/Abacaxi/Laranja/Morango',preco:7.5},
    {nome:'Polpa Graviola/Cacau/Maracujá/Açaí',preco:8},
    {nome:'Refri 1L Guaraná',preco:9,bar:true},{nome:'Refri 1L Coca-Cola',preco:12,bar:true},
    {nome:'Refri 2L Fanta/Guaraná',preco:15,bar:true},{nome:'Refri 2L Coca-Cola',preco:17,bar:true},
    {nome:'Refrigerante Lata',preco:6,bar:true},
  ])},
  {nome:'Cervejas', icon:'🍺', img:'img/cervejas.jpg', produtos: adicionarImagem([
    {nome:'Brahma / Skol 600ml',preco:10,bar:true},{nome:'Kaiser 600ml',preco:8,bar:true},
    {nome:'Original 600ml',preco:13,bar:true},{nome:'Spaten / Stella 600ml',preco:14,bar:true},
    {nome:'Heineken 600ml',preco:16,bar:true},
    {nome:'Vinho Taça',preco:22.9,bar:true},{nome:'Vinho Garrafa',preco:22.9,bar:true},
    {nome:'Vinho Pergola Taça',preco:10.9,bar:true},{nome:'Vinho Pergola Garrafa',preco:45.9,bar:true},
    {nome:'White Horse',preco:15,bar:true},{nome:'Old Eight',preco:8,bar:true},
    {nome:'Caip Orlof — Abacaxi',preco:20},{nome:'Caip Orlof — Morango',preco:20},
    {nome:'Caip Orlof — Limão',preco:20},{nome:'Caip Orlof — Maracujá',preco:20},
    {nome:'Pinga 51',preco:5,bar:true},{nome:'Vodka Orlof',preco:7,bar:true},
  ])},
  {nome:'Espaguete', icon:'🍝', img:'img/espaguete.jpg', produtos: adicionarImagem([
    {nome:'Espaguete na Chapa — Pequeno',preco:19.9},
    {nome:'Espaguete na Chapa — Grande',preco:29.9},
  ])},
];

// Estado do módulo garçom no caixa
let mesaAtualCx = null, itemPendenteCx = null, carrinhoAbertoCx = true;
let descontoAtualCx = 0, pagDivCx = [];
let mmTamanhoCx = null, mmSabor1Cx = null;

function telaCx(id){
  const ids = ['screen-main','screen-pedido','screen-fechamento-cx','screen-ok-cx'];
  ids.forEach(s => {
    const el = document.getElementById(s);
    if(el) el.classList.remove('active');
  });
  document.getElementById('screen-main').style.display = 'none';
  const alvo = document.getElementById('screen-'+id+'-cx') || document.getElementById('screen-'+id) || document.getElementById(id);
  if(alvo){ alvo.style.display='flex'; alvo.classList.add('active'); }
}
window.telaCx = telaCx;

window.voltarMesasCaixa = function(){
  ['screen-pedido','screen-fechamento-cx','screen-ok-cx'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){el.classList.remove('active');el.style.display='';}
  });
  const main = document.getElementById('screen-main');
  main.style.display = 'flex';
  main.classList.add('active');
  mudarAba('mesas');
};

function abrirMesaCx(id){
  mesaAtualCx = mesas.find(m=>m.id===id);
  if(!mesaAtualCx) return;
  if(!mesaAtualCx.inicio) mesaAtualCx.inicio = Date.now();
  if(mesaAtualCx.status==='livre') mesaAtualCx.status='ocupada';
  salvarMesaCx(mesaAtualCx);
  const tituloEl = document.getElementById('titulo-mesa-cx');
  if(mesaAtualCx.virtual){
    if(mesaAtualCx.canal==='balcao') tituloEl.textContent = '🍽️ Balcão '+String(mesaAtualCx.id).replace('B','')+(mesaAtualCx.nomeCliente?' — '+mesaAtualCx.nomeCliente:'');
    else if(mesaAtualCx.canal==='delivery') tituloEl.textContent = '📱 '+(mesaAtualCx.nomeCliente||'Delivery');
    else tituloEl.textContent = '📞 '+(mesaAtualCx.nomeCliente||'Telefone');
  }else{
    tituloEl.textContent = 'Mesa '+String(id).padStart(2,'0');
  }
  renderCategoriasCx();
  renderCarrinhoCx();
  renderStatusEntregaCx();
  const buscaEl = document.getElementById('busca-produto-cx');
  if(buscaEl) buscaEl.value = '';
  const main = document.getElementById('screen-main');
  main.classList.remove('active'); main.style.display='none';
  const pedido = document.getElementById('screen-pedido');
  pedido.style.display='flex'; pedido.classList.add('active');
}

// Barra de status de entrega (cozinha → motoboy → cliente) para delivery/telefone
function renderStatusEntregaCx(){
  let bar = document.getElementById('status-entrega-cx');
  const isEntrega = mesaAtualCx && mesaAtualCx.virtual && (mesaAtualCx.canal==='delivery' || mesaAtualCx.canal==='telefone');
  if(!isEntrega){
    if(bar) bar.style.display='none';
    return;
  }
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'status-entrega-cx';
    bar.style.cssText = 'padding:8px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:rgba(200,154,42,.08);border-bottom:1px solid var(--border2);';
    document.getElementById('screen-pedido').insertBefore(bar, document.getElementById('pedido-body-cx'));
  }
  bar.style.display='flex';
  const lista = mesaAtualCx.canal==='delivery' ? deliveryList : telefoneList;
  const p = lista.find(x=>x.id===mesaAtualCx.id);
  const status = p ? p.status : 'aguardando';
  const passos = mesaAtualCx.canal==='delivery'
    ? [['aguardando','⏳ Aguardando'],['preparando','👨‍🍳 Na cozinha'],['emrota','🛵 Em rota']]
    : [['aguardando','⏳ Aguardando'],['preparando','👨‍🍳 Na cozinha']];
  const itensAtuais = mesaAtualCx.pedido || [];
  const totalAtual = itensAtuais.reduce((s,i)=>s+i.preco*i.qtd,0) + (mesaAtualCx.taxa||0);
  bar.innerHTML = `<span style="font-size:12px;color:var(--txt2);">Status:</span>` +
    passos.map(([val,label])=>`<button onclick="avancarStatusEntregaCx('${val}')" class="btn${status===val?' btn-azul':''}" style="font-size:11px;padding:6px 10px;">${label}</button>`).join('') +
    (mesaAtualCx.endereco?`<span style="font-size:11px;color:var(--txt2);width:100%;margin-top:4px;">📍 ${mesaAtualCx.endereco}${mesaAtualCx.km?' · '+mesaAtualCx.km+'km':''}${mesaAtualCx.taxa?' · Taxa '+fmt(mesaAtualCx.taxa):''}</span>`:'') +
    `<button onclick="concluirPedidoEntregaCx()" class="btn btn-verde" style="width:100%;margin-top:6px;padding:11px;font-size:13px;font-weight:700;">✓ Concluir Pedido (motoboy entregou) — ${fmt(totalAtual)}</button>`;
}

// Finaliza o pedido de delivery/telefone: lança no relatório do dia (com a forma
// de pagamento já escolhida na criação do pedido), marca como entregue e libera a mesa.
// Funciona tanto vindo do card da lista (sem abrir a mesa) quanto de dentro da mesa.
async function concluirPedidoPorId(id, canal){
  const mesa = mesas.find(m=>m.id===id);
  const lista = canal==='delivery' ? deliveryList : telefoneList;
  const p = lista.find(x=>x.id===id);
  if(!p){ mostrarAlerta('Pedido não encontrado', 'vermelho'); return; }

  const itens = (mesa && mesa.pedido && mesa.pedido.length) ? mesa.pedido : (p.itens||[]);
  if(!itens.length){ mostrarAlerta('Não há itens neste pedido', 'vermelho'); return; }

  const subtotal = itens.reduce((s,i)=>s+i.preco*i.qtd,0);
  const taxa = (mesa && mesa.taxa) || p.taxa || 0;
  const total = subtotal + taxa;
  const nomeExibicao = p.nome || (mesa && mesa.nomeCliente) || (canal==='delivery' ? 'Delivery' : 'Telefone');

  if(!confirm('Concluir pedido de '+nomeExibicao+' — '+fmt(total)+'?\nIsso lança no relatório do dia e libera a mesa.')) return;

  const pagamento = p.pagamento || 'dinheiro';
  const hojeData = new Date().toLocaleDateString('pt-BR').replace(/\//g,'-');
  const venda = {
    id: Date.now(), mesa: id, canal,
    cliente: nomeExibicao, telefone: p.telefone || (mesa&&mesa.telefoneCliente) || '', endereco: p.endereco || (mesa&&mesa.endereco) || '',
    hora: new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
    itens: itens.map(it=>({nome:it.nome, qtd:it.qtd, preco:it.preco, obs:it.obs||''})),
    subtotal, desconto:0, taxa, total,
    pagamentos: [{tipo:pagamento, valor:total}],
    pagamento
  };

  try{
    await set(ref(db,`caixa/${hojeData}/vendas/v${Date.now()}`), venda);
    const snap = await get(ref(db,`caixa/${hojeData}`));
    const atual = snap.val()||{};
    const upd = {data:hojeData};
    upd[pagamento] = (atual[pagamento]||0) + total;
    if(taxa) upd.taxa = (atual.taxa||0) + taxa;
    if(canal==='delivery') upd.canalWhatsapp = (atual.canalWhatsapp||0)+1;
    if(canal==='telefone') upd.canalTelefone = (atual.canalTelefone||0)+1;
    await update(ref(db,`caixa/${hojeData}`), upd);

    p.status = 'entregue';
    if(mesa){
      mesa.status = 'livre'; mesa.pedido = []; mesa.inicio = null;
      await salvarMesaCx(mesa);
    }
    mesas = mesas.filter(m=>m.id!==id);

    if(canal==='delivery'){
      deliveryList = deliveryList.filter(x=>x.id!==id);
      localStorage.setItem('deliveryList', JSON.stringify(deliveryList));
      renderizarDelivery();
    }else{
      telefoneList = telefoneList.filter(x=>x.id!==id);
      localStorage.setItem('telefoneList', JSON.stringify(telefoneList));
      renderizarTelefone();
    }

    mostrarAlerta('Pedido de '+nomeExibicao+' concluído — '+fmt(total), 'verde');

    // Se a mesa desse pedido estava aberta na tela, fecha e volta pra lista
    if(mesaAtualCx && mesaAtualCx.id===id){
      mesaAtualCx = null;
      voltarMesasCaixa();
    }
  }catch(e){
    console.error('Erro ao concluir pedido:', e);
    mostrarAlerta('Erro ao concluir pedido: '+e.message, 'vermelho');
  }
}

// Botão dentro da tela da mesa (pedido aberto)
window.concluirPedidoEntregaCx = function(){
  if(!mesaAtualCx || !mesaAtualCx.virtual || !(mesaAtualCx.canal==='delivery'||mesaAtualCx.canal==='telefone')) return;
  concluirPedidoPorId(mesaAtualCx.id, mesaAtualCx.canal);
};

// Botão direto no card da lista (Delivery/Zap e Telefone) — sem precisar abrir a mesa
window.concluirPedidoCard = function(ev, id, canal){
  ev.stopPropagation();
  concluirPedidoPorId(id, canal);
};

window.avancarStatusEntregaCx = function(novoStatus){
  if(!mesaAtualCx) return;
  const lista = mesaAtualCx.canal==='delivery' ? deliveryList : telefoneList;
  const p = lista.find(x=>x.id===mesaAtualCx.id);
  if(p){
    p.status = novoStatus;
    localStorage.setItem(mesaAtualCx.canal==='delivery' ? 'deliveryList':'telefoneList', JSON.stringify(lista));
    if(mesaAtualCx.canal==='delivery') renderizarDelivery(); else renderizarTelefone();
  }
  renderStatusEntregaCx();
};

async function salvarMesaCx(mesa){
  if(typeof salvarMesasLocal === 'function') salvarMesasLocal();
  if(mesa.virtual){
    const total=(mesa.pedido||[]).reduce((s,i)=>s+i.preco*i.qtd,0);
    if(mesa.canal==='balcao'){
      const b=balcoes.find(x=>x.id===mesa.id);
      if(b){ b.total=total; salvarBalcoes(); renderizarBalcoes(); }
    }else if(mesa.canal==='delivery'){
      const p=deliveryList.find(x=>x.id===mesa.id);
      if(p){ p.total=total; localStorage.setItem('deliveryList',JSON.stringify(deliveryList)); renderizarDelivery(); }
    }else if(mesa.canal==='telefone'){
      const p=telefoneList.find(x=>x.id===mesa.id);
      if(p){ p.total=total; localStorage.setItem('telefoneList',JSON.stringify(telefoneList)); renderizarTelefone(); }
    }
  }
  try{
    const po={};(mesa.pedido||[]).forEach((it,i)=>po['i'+i]=it);
    await set(ref(db,'mesas/mesa'+mesa.id),{id:mesa.id,status:mesa.status,inicio:mesa.inicio,pedido:po});
  }catch(e){ console.warn('Erro ao salvar mesa:',e); }
}

// Sobrescreve o clique nas mesas do caixa para abrir pedido
function renderMesasCaixaComClick(){
  const grid = document.getElementById('caixa-mesa-grid');
  if(!grid) return;
  grid.innerHTML='';
  let liv=0,ocu=0,con=0;
  mesas.filter(m=>!m.virtual).forEach(m=>{
    if(m.status==='livre')liv++;
    else if(m.status==='ocupada')ocu++;
    else con++;
    const cor=m.status==='livre'?'#2f9d64':m.status==='ocupada'?'#cf5b74':'#c89a2a';
    const bg=m.status==='livre'?'linear-gradient(180deg,#edf8f0,#e0f5e6)':m.status==='ocupada'?'linear-gradient(180deg,#fff0f3,#ffe6ea)':'linear-gradient(180deg,#fff8e8,#fff2d2)';
    const total=(m.pedido||[]).reduce((s,i)=>s+i.preco*i.qtd,0);
    const el=document.createElement('div');
    el.className='caixa-mesa-card';
    el.style.cssText=`background:${bg};border-color:${cor};`;
    el.innerHTML=`<div style="font-size:13px;font-weight:700;color:${cor};">Mesa ${String(m.id).padStart(2,'0')}</div>
      <div style="font-size:10px;color:${cor};margin:2px 0;">${m.status==='livre'?'Livre':m.status==='ocupada'?'Ocupada':'Conta'}</div>
      ${total>0?`<div style="font-size:12px;font-weight:700;color:${cor};">${fmt(total)}</div>`:''}`;
    el.onclick=()=>abrirMesaCx(m.id);
    grid.appendChild(el);
  });
  document.getElementById('c-stat-livre').textContent=liv+' livres';
  document.getElementById('c-stat-ocup').textContent=ocu+' ocupadas';
  document.getElementById('c-stat-conta').textContent=con+' conta';
}

// ══════════════════════════════════════════════════
// 🎨 FUNÇÃO PARA USAR IMAGENS NAS CATEGORIAS
// ══════════════════════════════════════════════════
function getIconHTML(cat, size = '32px'){
  if(cat.img){
    return `<img src="${cat.img}" alt="${cat.nome}" 
      style="width:${size};height:${size};border-radius:8px;object-fit:cover;display:block;"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <span style="display:none;font-size:${parseInt(size)*0.6}px;align-items:center;justify-content:center;width:${size};height:${size};">${cat.icon || '🍽️'}</span>`;
  }
  return `<span style="font-size:${parseInt(size)*0.6}px;">${cat.icon || '🍽️'}</span>`;
}

// Busca produto por nome em TODAS as categorias (mesa, balcão, delivery, telefone)
window.buscarProdutoCx = function(termo){
  termo = (termo||'').trim().toLowerCase();
  const grid = document.getElementById('produto-grid-cx');
  if(!termo){
    document.getElementById('cat-list-cx').style.display='';
    selecionarCatCx(0);
    return;
  }
  document.getElementById('cat-list-cx').style.display='none';
  document.getElementById('cat-titulo-cx').textContent = '🔍 Resultados para "'+termo+'"';
  grid.innerHTML = '';
  let achou = false;
  categoriasCx.forEach(c=>{
    (c.produtos||[]).forEach(p=>{
      if(p.nome.toLowerCase().includes(termo)){
        achou = true;
        const el = document.createElement('div');
        el.className = 'produto-card';
        const ph = p.tamanhos
          ? `<div class="produto-tamanhos">M ${fmt(p.tamanhos.M)} | G ${fmt(p.tamanhos.G)} | GG ${fmt(p.tamanhos.GG)}</div>`
          : `<div class="produto-preco">${fmt(p.preco)}</div>`;
        el.innerHTML = `
          <img src="${p.img||''}" alt="${p.nome}" class="produto-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <div class="produto-no-img" style="display:none;">🍽️</div>
          <div class="produto-info">
            <div class="produto-nome">${p.nome}</div>
            ${ph}
          </div>
        `;
        el.onclick = () => adicionarItemCx(p, c.nome, c.pizza);
        grid.appendChild(el);
      }
    });
  });
  if(!achou){
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--txt2);font-size:13px;">Nenhum produto encontrado</div>';
  }
};

// Categorias e Produtos
function renderCategoriasCx(){
  const list=document.getElementById('cat-list-cx'); 
  list.innerHTML='';
  
  categoriasCx.forEach((c,i)=>{
    const el=document.createElement('div');
    el.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:72px;border-radius:14px;padding:6px 3px;gap:4px;font-size:9px;line-height:1.2;text-align:center;border:1px solid var(--border3);background:linear-gradient(180deg,#232a25,#171c18);color:var(--txt);cursor:pointer;transition:all .15s;';
    
    // Usa a função getIconHTML para mostrar imagem ou emoji
    el.innerHTML = `
      ${getIconHTML(c, '36px')}
      <span style="font-weight:500;">${c.nome}</span>
    `;
    
    if(i===0) {
      el.style.background='linear-gradient(180deg,#2f5e9f,#1f355c)';
      el.style.borderColor='var(--azul)';
    }
    
    el.onclick=()=>{
      document.querySelectorAll('#cat-list-cx div').forEach(b=>{
        b.style.background='linear-gradient(180deg,#232a25,#171c18)';
        b.style.borderColor='var(--border3)';
      });
      el.style.background='linear-gradient(180deg,#2f5e9f,#1f355c)';
      el.style.borderColor='var(--azul)';
      selecionarCatCx(i);
    };
    list.appendChild(el);
  });
  selecionarCatCx(0);
}

function selecionarCatCx(idx){
  const c = categoriasCx[idx];
  document.getElementById('cat-titulo-cx').textContent = c.icon + ' ' + c.nome;
  
  const grid = document.getElementById('produto-grid-cx'); 
  grid.innerHTML = '';
  
  // Botão Pizza Meio a Meio (só para categorias de pizza)
  if(c.pizza){
    const btnMM = document.createElement('div');
    btnMM.style.cssText = 'grid-column:1/-1;background:linear-gradient(180deg,#1a3564,#102040);border:2px solid var(--azul);border-radius:14px;padding:13px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;margin-bottom:4px;';
    btnMM.innerHTML = '<span style="font-size:22px;">🍕</span><div><div style="font-weight:700;font-size:14px;color:#aad4ff;">Pizza Meio a Meio</div><div style="font-size:11px;color:var(--txt2);">Escolha 2 sabores — G ou GG</div></div>';
    btnMM.onclick = () => abrirMeioAMeioCx();
    grid.appendChild(btnMM);
  }
  
  // Renderiza cada produto
  c.produtos.forEach(p => {
    const el = document.createElement('div');
    el.className = 'produto-card';
    
    const ph = p.tamanhos 
      ? `<div class="produto-tamanhos">M ${fmt(p.tamanhos.M)} | G ${fmt(p.tamanhos.G)} | GG ${fmt(p.tamanhos.GG)}</div>`
      : `<div class="produto-preco">${fmt(p.preco)}</div>`;
    
    el.innerHTML = `
      <img src="${p.img||''}" alt="${p.nome}" class="produto-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <div class="produto-no-img" style="display:none;">🍽️</div>
      <div class="produto-info">
        <div class="produto-nome">${p.nome}</div>
        ${ph}
      </div>
    `;
    
    el.onclick = () => adicionarItemCx(p, c.nome, c.pizza);
    grid.appendChild(el);
  });
}

function adicionarItemCx(p,catNome,pizza){
  if(pizza&&p.tamanhos){
    itemPendenteCx={...p,categoria:catNome};
    document.getElementById('modal-pizza-nome-cx').textContent=p.nome;
    document.getElementById('cx-btn-tam-M').textContent='Média (M) — '+fmt(p.tamanhos.M);
    document.getElementById('cx-btn-tam-G').textContent='Grande (G) — '+fmt(p.tamanhos.G);
    document.getElementById('cx-btn-tam-GG').textContent='Gigante (GG) — '+fmt(p.tamanhos.GG);
    abrirModal('modal-tamanho-cx'); return;
  }
  if(p.bar){ pushItemCx(p,'',catNome); return; }
  itemPendenteCx={...p,categoria:catNome};
  document.getElementById('modal-obs-nome-cx').textContent=p.nome;
  document.getElementById('input-obs-cx').value='';
  abrirModal('modal-obs-cx');
}

window.escolherTamanhoCx=function(tam){
  const p=itemPendenteCx; if(!p) return;
  abrirBordaCx(p.nome, tam, p.tamanhos[tam], p.categoria);
};

function abrirBordaCx(pizzaNome, tam, preco, catNome){
  itemPendenteCx={nome:pizzaNome,preco,tamanhoObs:tam,categoria:catNome};
  document.getElementById('borda-pizza-nome-cx').textContent=pizzaNome;
  document.getElementById('borda-tam-info-cx').textContent='Tamanho: '+tam+' — '+fmt(preco);
  const ops=document.getElementById('borda-opcoes-cx'); ops.innerHTML='';
  Object.entries(BORDAS_CX).forEach(([nome,precos])=>{
    const precoBorda=precos[tam]||0;
    const btn=document.createElement('button');
    btn.className='btn';
    btn.style.cssText='text-align:left;padding:13px 16px;font-size:14px;font-weight:600;width:100%;';
    btn.textContent='Borda de '+nome+' — +'+fmt(precoBorda);
    btn.onclick=()=>{ fecharModal('modal-borda-cx'); confirmarPizzaComBordaCx('Borda de '+nome, precoBorda); };
    ops.appendChild(btn);
  });
  fecharModal('modal-tamanho-cx');
  abrirModal('modal-borda-cx');
}

window.semBordaCx=function(){
  fecharModal('modal-borda-cx');
  const p=itemPendenteCx; if(!p) return;
  itemPendenteCx._obsBase=p.tamanhoObs;
  itemPendenteCx._precoFinal=p.preco;
  document.getElementById('modal-obs-nome-cx').textContent=p.nome;
  document.getElementById('input-obs-cx').value='';
  setTimeout(()=>abrirModal('modal-obs-cx'),150);
};

function confirmarPizzaComBordaCx(bordaNome, precoBorda){
  const p=itemPendenteCx; if(!p) return;
  itemPendenteCx._obsBase=p.tamanhoObs+' + '+bordaNome;
  itemPendenteCx._precoFinal=p.preco+precoBorda;
  document.getElementById('modal-obs-nome-cx').textContent=p.nome;
  document.getElementById('input-obs-cx').value='';
  setTimeout(()=>abrirModal('modal-obs-cx'),150);
}

window.confirmarObsCx=function(){
  const obs=document.getElementById('input-obs-cx').value.trim();
  fecharModal('modal-obs-cx');
  const p=itemPendenteCx; if(!p){itemPendenteCx=null;return;}
  const obsFinal=p._obsBase?(obs?p._obsBase+' — '+obs:p._obsBase):obs;
  const preco=p._precoFinal!==undefined?p._precoFinal:p.preco;
  pushItemCx({nome:p.nome,preco},obsFinal,p.categoria);
  itemPendenteCx=null;
};

window.confirmarObsSemCx=function(){
  fecharModal('modal-obs-cx');
  const p=itemPendenteCx; if(!p){itemPendenteCx=null;return;}
  const obsFinal=p._obsBase||'';
  const preco=p._precoFinal!==undefined?p._precoFinal:p.preco;
  pushItemCx({nome:p.nome,preco},obsFinal,p.categoria);
  itemPendenteCx=null;
};

function pushItemCx(p,obs,catNome){
  const ex=mesaAtualCx.pedido.find(i=>i.nome===p.nome&&i.obs===obs&&!i.enviadoCozinha);
  if(ex) ex.qtd++;
  else mesaAtualCx.pedido.push({nome:p.nome,preco:p.preco,qtd:1,obs,categoria:catNome||'',setor:p.bar?'bar':'cozinha',enviadoCozinha:false,criadoEm:Date.now()});
  salvarMesaCx(mesaAtualCx);
  renderCarrinhoCx();
}

function renderCarrinhoCx(){
  const lista=document.getElementById('carrinho-lista-cx');
  const total=(mesaAtualCx.pedido||[]).reduce((s,i)=>s+i.preco*i.qtd,0);
  const qtd=(mesaAtualCx.pedido||[]).reduce((s,i)=>s+i.qtd,0);
  document.getElementById('badge-qtd-cx').textContent=qtd;
  document.getElementById('total-pedido-cx').textContent=fmt(total);
  if(!mesaAtualCx.pedido||!mesaAtualCx.pedido.length){
    lista.innerHTML='<div style="font-size:12px;color:var(--txt2);text-align:center;padding:12px;">Nenhum item</div>';return;
  }
  lista.innerHTML='';
  mesaAtualCx.pedido.forEach((it,idx)=>{
    const d=document.createElement('div');
    d.style.cssText='background:linear-gradient(180deg,#171c18,#131814);border:1px solid #252d28;border-radius:14px;padding:9px;font-size:12px;margin:5px 0;';
    d.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:start;">
      <div style="flex:1;padding-right:4px;"><span style="font-weight:600;">${it.nome}</span>${it.obs?`<span style="font-size:10px;color:var(--txt2);"> — ${it.obs}</span>`:''}
        <div style="margin-top:4px;"><span style="background:${it.enviadoCozinha?'var(--verde-bg)':'#3a2e0a'};color:${it.enviadoCozinha?'var(--verde)':'#c9a427'};border-radius:999px;font-size:10px;padding:2px 7px;">${it.enviadoCozinha?'✓ Enviado':'⏳ Novo'}</span></div></div>
      <button onclick="removerItemCx(${idx})" style="background:none;border:none;cursor:pointer;color:var(--txt2);font-size:20px;padding:0;line-height:1;">×</button></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <button onclick="ajustarQtdCx(${idx},-1)" style="background:#1f2521;border:1px solid #313a33;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px;color:var(--txt);display:flex;align-items:center;justify-content:center;">-</button>
        <span style="font-weight:700;min-width:16px;text-align:center;">${it.qtd}</span>
        <button onclick="ajustarQtdCx(${idx},1)" style="background:#1f2521;border:1px solid #313a33;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px;color:var(--txt);display:flex;align-items:center;justify-content:center;">+</button>
      </div>
      <span style="color:var(--verde);font-weight:700;">${fmt(it.preco*it.qtd)}</span></div>`;
    lista.appendChild(d);
  });
}

window.ajustarQtdCx=(idx,d)=>{
  mesaAtualCx.pedido[idx].qtd+=d;
  if(mesaAtualCx.pedido[idx].qtd<=0) mesaAtualCx.pedido.splice(idx,1);
  salvarMesaCx(mesaAtualCx); renderCarrinhoCx();
};
window.removerItemCx=idx=>{
  mesaAtualCx.pedido.splice(idx,1);
  salvarMesaCx(mesaAtualCx); renderCarrinhoCx();
};
window.toggleCarrinhoCx=function(){
  carrinhoAbertoCx=!carrinhoAbertoCx;
  document.getElementById('carrinho-body-cx').style.display=carrinhoAbertoCx?'block':'none';
  document.getElementById('carrinho-toggle-cx').textContent=carrinhoAbertoCx?'▲':'▼';
};

window.enviarCozinhaCx=async function(){
  if(!mesaAtualCx||!mesaAtualCx.pedido||!mesaAtualCx.pedido.length) return;
  const todos=mesaAtualCx.pedido.filter(it=>!it.enviadoCozinha&&it.setor!=='bar');
  if(!todos.length){
    document.getElementById('cozinha-msg-cx').textContent='Todos os itens já foram enviados.';
    abrirModal('modal-cozinha-cx'); return;
  }
  const codigo=mesaAtualCx.id+'-'+Date.now().toString().slice(-5);
  const dados={mesa:mesaAtualCx.id,codigo,data:new Date().toLocaleString('pt-BR'),
    itens:todos.map(it=>({nome:it.nome,qtd:it.qtd,preco:it.preco,obs:it.obs||'',setor:it.setor||''}))};
  try{
    await push(ref(db,'pedidos_cozinha'),{...dados,status:'pendente',timestamp:Date.now()});
    todos.forEach(it=>{it.enviadoCozinha=true;it.enviadoEm=Date.now();});
    salvarMesaCx(mesaAtualCx); renderCarrinhoCx();
    if(mesaAtualCx.virtual && (mesaAtualCx.canal==='delivery'||mesaAtualCx.canal==='telefone')){
      avancarStatusEntregaCx('preparando');
    }
    document.getElementById('cozinha-icon-cx').textContent='🔔';
    document.getElementById('cozinha-titulo-cx').textContent='Pedido enviado!';
    document.getElementById('cozinha-msg-cx').textContent=todos.reduce((s,i)=>s+i.qtd,0)+' item(ns) enviado(s) para a cozinha!';
  }catch(e){
    document.getElementById('cozinha-icon-cx').textContent='⚠';
    document.getElementById('cozinha-titulo-cx').textContent='Erro ao enviar';
    document.getElementById('cozinha-msg-cx').textContent='Verifique a conexão e tente novamente.';
  }
  abrirModal('modal-cozinha-cx');
};

// Fechamento
window.abrirFechamentoCx=function(){
    abaFechCx = 'total';
qtdSelCx = {};
(mesaAtualCx.pedido||[]).forEach((_,i)=>{ qtdSelCx[i] = mesaAtualCx.pedido[i].qtd; });
  descontoAtualCx=0; pagDivCx=[];
  document.getElementById('titulo-fech-cx').textContent='Fechamento — Mesa '+String(mesaAtualCx.id).padStart(2,'0');
  document.getElementById('desconto-info-cx').textContent='Nenhum aplicado';
  document.getElementById('cx-troco-box').style.display='none';
  renderFechamentoCx();
  const pedido=document.getElementById('screen-pedido');
  pedido.classList.remove('active'); pedido.style.display='none';
  const fech=document.getElementById('screen-fechamento-cx');
  fech.style.display='flex'; fech.classList.add('active');
};

function subTotalFechCx(){
  if(abaFechCx === 'parcial'){
    return (mesaAtualCx.pedido||[]).reduce((s,it,i)=>s+it.preco*(qtdSelCx[i]||0),0);
  }
  return (mesaAtualCx.pedido||[]).reduce((s,it)=>s+it.preco*it.qtd,0);
}

function renderFechamentoCx(){
  const tabela=document.getElementById('tabela-fech-cx'); tabela.innerHTML='';
  const sub=subTotalFechCx();
  (mesaAtualCx.pedido||[]).forEach(it=>{
    const r=document.createElement('div');
    r.style.cssText='display:flex;justify-content:space-between;font-size:13px;padding:6px 14px;border-bottom:1px solid var(--border2);';
    r.innerHTML=`<div><span style="font-weight:500;">${it.nome}</span>${it.obs?`<span style="font-size:11px;color:var(--txt2);"> — ${it.obs}</span>`:''} <span style="color:var(--txt2);">x${it.qtd}</span></div><span style="font-weight:600;">${fmt(it.preco*it.qtd)}</span>`;
    tabela.appendChild(r);
  });
  document.getElementById('subtotal-fech-cx').textContent=fmt(sub);
  const taxaLinha=document.getElementById('taxa-fech-cx-linha');
  if(mesaAtualCx.taxa){
    taxaLinha.style.display='flex';
    document.getElementById('taxa-fech-cx-valor').textContent=fmt(mesaAtualCx.taxa);
  }else{
    taxaLinha.style.display='none';
  }
  atualizarTotalCx(sub);
  renderPagDivCx();
}

function atualizarTotalCx(sub){
  const taxa=(mesaAtualCx&&mesaAtualCx.taxa)?mesaAtualCx.taxa:0;
  const total=sub-(sub*(descontoAtualCx/100))+taxa;
  document.getElementById('total-final-cx').textContent=fmt(total);
}

window.aplicarDescontoCx=function(pct){
  descontoAtualCx=pct;
  const sub=subTotalFechCx();
  document.getElementById('desconto-info-cx').textContent=pct===0?'Nenhum aplicado':pct>0?pct+'% de desconto':Math.abs(pct)+'% de taxa';
  atualizarTotalCx(sub);
  renderPagDivCx();
};

window.addPagCx=function(tipo){
  if(pagDivCx.find(p=>p.tipo===tipo)) return;
  pagDivCx.push({tipo,valor:''});
  renderPagDivCx();
};

window.remPagCx=function(tipo){
  pagDivCx=pagDivCx.filter(p=>p.tipo!==tipo);
  if(!pagDivCx.find(p=>p.tipo==='dinheiro')) document.getElementById('cx-troco-box').style.display='none';
  renderPagDivCx();
};

window.setPagDivValCx=function(tipo,val){
  const p=pagDivCx.find(p=>p.tipo===tipo);
  if(p) p.valor=val;
  if(tipo==='dinheiro') calcularTrocoCx();
  atualizarResumoPagCx();
};

function totalPagDivCx(){ return pagDivCx.reduce((s,p)=>s+(parseFloat(p.valor)||0),0); }

function renderPagDivCx(){
  ['dinheiro','cartao','pix'].forEach(t=>{
    const b=document.getElementById('cx-addpag-'+t);
    if(b) b.className='add-pag-btn'+(pagDivCx.find(p=>p.tipo===t)?' usado':'');
  });
  const lista=document.getElementById('pag-div-lista-cx'); 
  lista.innerHTML='';
  const icones={dinheiro:'💵',cartao:'💳',pix:'📲'};
  const nomes={dinheiro:'Dinheiro',cartao:'Cartão',pix:'Pix'};
  const bgs={dinheiro:'#1a2e1e',cartao:'#1b3158',pix:'#3a2e0a'};
  
  pagDivCx.forEach(p=>{
    const row=document.createElement('div');
    row.style.cssText='background:linear-gradient(180deg,#171c18,#131814);border:1px solid #252d28;border-radius:14px;padding:10px 12px;display:flex;align-items:center;gap:10px;margin-bottom:7px;';
    
    row.innerHTML=`<div style="width:30px;height:30px;border-radius:8px;background:${bgs[p.tipo]};display:flex;align-items:center;justify-content:center;font-size:16px;">${icones[p.tipo]}</div>
      <span style="font-size:13px;font-weight:600;min-width:58px;">${nomes[p.tipo]}</span>
      <input type="number" min="0" step="0.01" placeholder="0,00" value="${p.valor}" oninput="setPagDivValCx('${p.tipo}',this.value)" style="flex:1;padding:8px 10px;background:#1a201c;border:1px solid var(--border3);border-radius:10px;color:var(--txt);font-size:16px;font-weight:600;font-family:var(--font);text-align:right;"/>
      <button onclick="remPagCx('${p.tipo}')" style="background:none;border:none;cursor:pointer;color:var(--txt2);font-size:18px;">×</button>`;
    
    lista.appendChild(row);
  });
  
  document.getElementById('cx-troco-box').style.display=pagDivCx.find(p=>p.tipo==='dinheiro')?'block':'none';
  atualizarResumoPagCx();
}
function atualizarResumoPagCx(){
  const sub=subTotalFechCx();
  const taxa=(mesaAtualCx&&mesaAtualCx.taxa)?mesaAtualCx.taxa:0;
  const total=sub-(sub*(descontoAtualCx/100))+taxa;
  const pago=totalPagDivCx();
  const falta=Math.max(0,total-pago);
  const pct=total>0?Math.min(100,(pago/total)*100):0;
  document.getElementById('cx-total-ref').textContent=fmt(total);
  document.getElementById('cx-res-pago').textContent=fmt(pago);
  const diffEl=document.getElementById('cx-res-diff');
  if(pago>=total&&pagDivCx.length>0){ diffEl.textContent=pago-total>0.005?'Troco: '+fmt(pago-total):'✓ Pago'; diffEl.style.color='var(--verde)'; }
  else{ diffEl.textContent='Falta: '+fmt(falta); diffEl.style.color='#cf5b74'; }
  document.getElementById('cx-falta-bar').style.width=pct+'%';
  const ok=pagDivCx.length>0&&pago>=total&&(mesaAtualCx.pedido||[]).length>0;
  const btn=document.getElementById('btn-confirmar-cx');
  btn.style.opacity=ok?'1':'0.4';
  btn.style.pointerEvents=ok?'auto':'none';
}

window.calcularTrocoCx=function(){
  const sub=subTotalFechCx();
  const taxaRec=(mesaAtualCx&&mesaAtualCx.taxa)?mesaAtualCx.taxa:0;
  const total=sub-(sub*(descontoAtualCx/100))+taxaRec;
  const rec=parseFloat(document.getElementById('cx-valor-recebido').value)||0;
  const troco=rec-total;
  document.getElementById('cx-valor-troco').textContent=fmt(troco>=0?troco:0);
  document.getElementById('cx-valor-troco').style.color=troco>=0?'var(--verde)':'#cf5b74';
};

window.imprimirContaCx=async function(){
  let itensImp;
  
  // ✅ Se for parcial, filtra só os itens selecionados
  if(abaFechCx === 'parcial'){
    itensImp = [];
    (mesaAtualCx.pedido||[]).forEach((it, idx) => {
      const q = qtdSelCx[idx] || 0;
      if(q > 0){
        itensImp.push({nome:it.nome, qtd:q, preco:it.preco, obs:it.obs||''});
      }
    });
  } else {
    // Modo normal: todos os itens
    itensImp = (mesaAtualCx.pedido||[]).map(it=>({nome:it.nome,qtd:it.qtd,preco:it.preco,obs:it.obs||''}));
  }
  
  const dados={
    mesa:mesaAtualCx.id,
    desconto:descontoAtualCx,
    pagamentos:pagDivCx.map(p=>({tipo:p.tipo,valor:parseFloat(p.valor)||0})),
    data:new Date().toLocaleString('pt-BR'),
    itens:itensImp,
    parcial:abaFechCx === 'parcial'  // ✅ Avisa que é parcial
  };
  
  try{ 
    await push(ref(db,'contas_imprimir'),{...dados,status:'pendente',timestamp:Date.now()}); 
  }
  catch(e){ console.warn('Erro ao enviar conta:',e); }
};

window.concluirVendaCx=async function(){
  if(pagDivCx.length===0){alert('Adicione pelo menos uma forma de pagamento.');return;}
  const sub=subTotalFechCx();
  const desc=sub*(descontoAtualCx/100);
  // A taxa de entrega só é cobrada uma vez (não se repete em fechamentos parciais seguintes)
  const taxaCobrar=(!mesaAtualCx._taxaCobrada && mesaAtualCx.taxa) ? mesaAtualCx.taxa : 0;
  const total=sub-desc+taxaCobrar;
  const pago=totalPagDivCx();
  if(pago<total){alert('Valor pago menor que o total.');return;}
  const nomeExibicao=mesaAtualCx.virtual?(mesaAtualCx.nomeCliente||('Balcão '+String(mesaAtualCx.id).replace('B',''))):'Mesa '+String(mesaAtualCx.id).padStart(2,'0');
  if(!confirm('Confirmar pagamento e liberar '+nomeExibicao+'?')) return;
  const hoje=new Date().toLocaleDateString('pt-BR').replace(/\//g,'-');
  const canal=mesaAtualCx.canal||'mesa';
  const venda={id:Date.now(),mesa:mesaAtualCx.id,canal,
    cliente:mesaAtualCx.nomeCliente||'',telefone:mesaAtualCx.telefoneCliente||'',endereco:mesaAtualCx.endereco||'',
    hora:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
    itens:(mesaAtualCx.pedido||[]).map(it=>({nome:it.nome,qtd:it.qtd,preco:it.preco,obs:it.obs||''})),
    subtotal:sub,desconto:desc,taxa:taxaCobrar,total,
    pagamentos:pagDivCx.map(p=>({tipo:p.tipo,valor:parseFloat(p.valor)||0})),
    pagamento:pagDivCx[0].tipo};
  try{
    await set(ref(db,`caixa/${hoje}/vendas/v${Date.now()}`),venda);
    const snap=await get(ref(db,`caixa/${hoje}`));
    const atual=snap.val()||{};
    const upd={data:hoje};
    pagDivCx.forEach(p=>{ upd[p.tipo]=(atual[p.tipo]||0)+(parseFloat(p.valor)||0); });
    if(taxaCobrar) upd.taxa=(atual.taxa||0)+taxaCobrar;
    if(canal==='delivery') upd.canalWhatsapp=(atual.canalWhatsapp||0)+1;
    if(canal==='telefone') upd.canalTelefone=(atual.canalTelefone||0)+1;
    await update(ref(db,`caixa/${hoje}`),upd);
    await window.imprimirContaCx();
    if(taxaCobrar) mesaAtualCx._taxaCobrada=true;
    let fechouTotal=false;
    if(abaFechCx === 'parcial'){
    const novos = [];
    (mesaAtualCx.pedido||[]).forEach((it,i)=>{
        const resto = it.qtd - (qtdSelCx[i]||0);
        if(resto > 0) novos.push({...it, qtd:resto});
    });
    mesaAtualCx.pedido = novos;
    if(!novos.length){ mesaAtualCx.status='livre'; mesaAtualCx.inicio=null; fechouTotal=true; }
    } else {
    mesaAtualCx.status='livre'; mesaAtualCx.pedido=[]; mesaAtualCx.inicio=null; fechouTotal=true;
    }
    await salvarMesaCx(mesaAtualCx);

    // Se fechou totalmente uma mesa virtual (balcão/delivery/telefone), remove das listas
    if(fechouTotal && mesaAtualCx.virtual){
      const idFechado=mesaAtualCx.id;
      mesas=mesas.filter(m=>m.id!==idFechado);
      if(canal==='balcao'){
        balcoes=balcoes.filter(b=>b.id!==idFechado); salvarBalcoes(); renderizarBalcoes();
      }else if(canal==='delivery'){
        deliveryList=deliveryList.filter(p=>p.id!==idFechado);
        localStorage.setItem('deliveryList',JSON.stringify(deliveryList)); renderizarDelivery();
      }else if(canal==='telefone'){
        telefoneList=telefoneList.filter(p=>p.id!==idFechado);
        localStorage.setItem('telefoneList',JSON.stringify(telefoneList)); renderizarTelefone();
      }
    }

    const pagDesc=pagDivCx.map(p=>({dinheiro:'💵',cartao:'💳',pix:'📲'}[p.tipo]+' '+fmt(parseFloat(p.valor)||0))).join(' · ');
    document.getElementById('ok-msg-cx').textContent=nomeExibicao+' liberada · '+fmt(total)+'\n'+pagDesc;
    mesaAtualCx=null;
    const fech=document.getElementById('screen-fechamento-cx');
    fech.classList.remove('active'); fech.style.display='none';
    const ok=document.getElementById('screen-ok-cx');
    ok.style.display='flex'; ok.classList.add('active');
  }catch(e){ alert('Erro ao confirmar pagamento: '+e.message); }
};

// Meio a Meio
window.abrirMeioAMeioCx=function(){ mmSabor1Cx=null; mmTamanhoCx=null; abrirModal('modal-mm-tamanho-cx'); };
window.escolherTamMMCx=function(tam){ mmTamanhoCx=tam; fecharModal('modal-mm-tamanho-cx'); filtrarMM1Cx('trad'); abrirModal('modal-meiomeio1-cx'); };

function renderListaMMCx(containerId, tipo, onClickFn){
  const container=document.getElementById(containerId); container.innerHTML='';
  const lista=tipo==='trad'?pizzasTradCx:pizzasEspCx;
  lista.forEach(p=>{
    const metade=p.tamanhos[mmTamanhoCx]/2;
    const btn=document.createElement('button');
    btn.className='btn';
    btn.style.cssText='text-align:left;padding:11px 14px;font-size:13px;width:100%;';
    btn.innerHTML='<span style="font-weight:600;">'+p.nome+'</span><br><span style="font-size:11px;color:var(--verde);">½ = '+fmt(metade)+'</span>';
    btn.onclick=()=>onClickFn({nome:p.nome,metade});
    container.appendChild(btn);
  });
}

window.filtrarMM1Cx=function(tipo){
  document.getElementById('cx-mm1-btn-trad').className='btn'+(tipo==='trad'?' btn-azul':'');
  document.getElementById('cx-mm1-btn-esp').className='btn'+(tipo==='esp'?' btn-azul':'');
  renderListaMMCx('cx-mm1-lista',tipo,(it)=>{
    mmSabor1Cx=it;
    document.getElementById('cx-mm2-sabor1-info').textContent='1º: '+it.nome+' ('+fmt(it.metade)+')';
    fecharModal('modal-meiomeio1-cx'); filtrarMM2Cx('trad'); abrirModal('modal-meiomeio2-cx');
  });
};

window.filtrarMM2Cx=function(tipo){
  document.getElementById('cx-mm2-btn-trad').className='btn'+(tipo==='trad'?' btn-azul':'');
  document.getElementById('cx-mm2-btn-esp').className='btn'+(tipo==='esp'?' btn-azul':'');
  renderListaMMCx('cx-mm2-lista',tipo,(it)=>{
    fecharModal('modal-meiomeio2-cx');
    const total=mmSabor1Cx.metade+it.metade;
    const nome='½ '+mmSabor1Cx.nome+' / ½ '+it.nome;
    const tam=mmTamanhoCx;
    mmSabor1Cx=null; mmTamanhoCx=null;
    setTimeout(()=>abrirBordaCx(nome,tam,total,'Pizza Trad.'),200);
  });
};
// ── PARCIAL CX ──
let abaFechCx = 'total';
let qtdSelCx = {};

window.mudarAbaFechCx = function(aba){
  abaFechCx = aba;
  const ativo = 'flex:1;padding:11px;font-size:13px;font-weight:600;background:var(--card);border:none;color:var(--verde);border-bottom:2px solid var(--verde);cursor:pointer;font-family:var(--font);';
  const inativo = 'flex:1;padding:11px;font-size:13px;font-weight:600;background:transparent;border:none;color:var(--txt2);border-bottom:2px solid transparent;cursor:pointer;font-family:var(--font);';
  document.getElementById('cx-aba-total').style.cssText = aba==='total' ? ativo : inativo;
  document.getElementById('cx-aba-parcial').style.cssText = aba==='parcial' ? ativo : inativo;
  if(aba==='total'){
    (mesaAtualCx.pedido||[]).forEach((_,i)=>{ qtdSelCx[i] = mesaAtualCx.pedido[i].qtd; });
  }
  renderFechamentoCx();
};

window.abrirModalParcialCx = function(){
  renderModalParcialCx();
  abrirModal('modal-parcial-cx');
};

function renderModalParcialCx(){
  const lista = document.getElementById('lista-parcial-cx');
  lista.innerHTML = '';
  (mesaAtualCx.pedido||[]).forEach((it, idx)=>{
    const sel = qtdSelCx[idx] || 0;
    const marcado = sel > 0;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 12px;border-bottom:1px solid #2a322c;cursor:pointer;'+(marcado?'background:rgba(47,179,109,.08);':'');
    row.onclick = ()=>{ qtdSelCx[idx] = marcado ? 0 : it.qtd; renderModalParcialCx(); };
    row.innerHTML = `
      <div style="width:28px;height:28px;border-radius:8px;border:2px solid ${marcado?'var(--verde)':'var(--border3)'};background:${marcado?'var(--verde)':'transparent'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px;">${marcado?'✓':''}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;">${it.nome}</div>
        ${it.obs?`<div style="font-size:10px;color:var(--txt2);">${it.obs}</div>`:''}
        <div style="font-size:11px;color:var(--txt2);margin-top:2px;">${it.qtd} × ${fmt(it.preco)}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:14px;font-weight:700;color:${marcado?'var(--verde)':'var(--txt2)'};">${fmt(it.preco*sel)}</div>
        <div style="font-size:10px;color:var(--txt2);">${marcado?sel+' un.':'não selecionado'}</div>
      </div>`;
    lista.appendChild(row);
  });
}

window.toggleTodosParcialCx = function(){
  const todos = mesaAtualCx.pedido||[];
  const algum = todos.some((_,i)=>!qtdSelCx[i]||qtdSelCx[i]===0);
  todos.forEach((_,i)=>{ qtdSelCx[i] = algum ? todos[i].qtd : 0; });
  renderModalParcialCx();
};

window.confirmarParcialCx = function(){
  fecharModal('modal-parcial-cx');
  abaFechCx = 'parcial';
  const ativo = 'flex:1;padding:11px;font-size:13px;font-weight:600;background:var(--card);border:none;color:var(--verde);border-bottom:2px solid var(--verde);cursor:pointer;font-family:var(--font);';
  const inativo = 'flex:1;padding:11px;font-size:13px;font-weight:600;background:transparent;border:none;color:var(--txt2);border-bottom:2px solid transparent;cursor:pointer;font-family:var(--font);';
  document.getElementById('cx-aba-total').style.cssText = inativo;
  document.getElementById('cx-aba-parcial').style.cssText = ativo;
  renderFechamentoCx();
};

// Atualiza subTotal e renderFechamento para respeitar parcial
// Substituir renderMesasCaixa pela versão com clique
setTimeout(()=>{ renderMesasCaixaComClick(); },500);
// 5. ATIVAÇÃO FINAL DA TELA
document.getElementById('screen-main').classList.add('active');
document.getElementById('screen-main').style.display = 'flex';

// Garante que telas extras começam escondidas
['screen-pedido','screen-fechamento-cx','screen-ok-cx'].forEach(id=>{
  const el = document.getElementById(id);
  if(el){ el.classList.remove('active'); el.style.display='none'; }
});

// Atualiza mesas com clique completo após carregar Firebase
setTimeout(()=>{ renderMesasCaixaComClick(); }, 800);

// ══════════════════════════════════════════════
// ABA PREÇOS
// ══════════════════════════════════════════════
let todosProdutos = [];

function carregarProdutosPrecos() {
  todosProdutos = [];
  categoriasCx.forEach(cat => {
    cat.produtos.forEach(p => {
      todosProdutos.push({
        key: p.nome.replace(/[^a-zA-Z0-9]/g,'_').substring(0,30),
        catKey: cat.nome,
        nome: p.nome,
        preco: p.preco || p.tamanhos?.M || 0
      });
    });
  });
  renderListaPrecos(todosProdutos);
}

window.filtrarProdutos = function() {
  const termo = document.getElementById('busca-produto').value.toLowerCase();
  const filtrados = todosProdutos.filter(p => p.nome.toLowerCase().includes(termo));
  renderListaPrecos(filtrados);
};

function renderListaPrecos(lista) {
  const div = document.getElementById('lista-precos');
  if (!lista.length) {
    div.innerHTML = '<div style="text-align:center;color:var(--txt2);padding:30px;">Nenhum produto encontrado</div>';
    return;
  }
  div.innerHTML = lista.map(p => `
    <div style="background:#141a15;border:1px solid #252d28;border-radius:14px;
      padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;">${p.nome}</div>
        <div style="font-size:11px;color:var(--txt2);margin-top:2px;">${p.catKey}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <span style="font-size:11px;color:var(--txt2);">R$</span>
        <input type="number" step="0.01" value="${p.preco}"
          id="preco-${p.catKey}-${p.key}"
          style="width:90px;background:#1a201c;border:1px solid #303a33;
          border-radius:8px;color:#f4f7f1;font-size:15px;font-weight:700;
          padding:6px 10px;text-align:right;">
        <button onclick='salvarPreco("${p.catKey}","${p.key}")'
          style="background:linear-gradient(180deg,#2aa160,#1d7b49);color:#fff;
          border:none;border-radius:8px;padding:8px 14px;font-size:12px;
          font-weight:700;cursor:pointer;">✓</button>
      </div>
    </div>
  `).join('');
}

window.salvarPreco = function(catKey, prodKey) {
  const input = document.getElementById(`preco-${catKey}-${prodKey}`);
  const novoPreco = parseFloat(input.value);
  if (isNaN(novoPreco) || novoPreco < 0) { alert('Preço inválido!'); return; }
  set(ref(db, `precos/${prodKey}`), novoPreco)
    .then(() => {
      input.style.borderColor = '#2fb36d';
      setTimeout(() => input.style.borderColor = '#303a33', 1500);
    })
    .catch(() => alert('Erro ao salvar. Verifique a conexão.'));
};
/* ═══════════════════════════════════════════════════════════════ */
/* NOVO LAYOUT MESAS — BALCÃO / DELIVERY / TELEFONE              */
/* ═══════════════════════════════════════════════════════════════ */

// Estado global (adapte ao seu sistema existente)
window.balcoes = window.balcoes || [];
window.deliveryList = window.deliveryList || [];
window.telefoneList = window.telefoneList || [];
window._tipoNovoPedido = 'delivery'; // 'delivery' | 'telefone'

/* ───────────────────────────────────────────────────────────── */
/* RENDERIZAÇÃO DAS MESAS (grid 4x4)                             */
/* ───────────────────────────────────────────────────────────── */
function renderizarMesasNovo() {
  const grid = document.getElementById('mesasGridNovo');
  if (!grid) return;

  const numMesas = parseInt(localStorage.getItem('numMesas') || '16', 10);
  const mesas = JSON.parse(localStorage.getItem('mesas') || '{}');

  grid.innerHTML = '';

  for (let i = 1; i <= numMesas; i++) {
    const num = String(i).padStart(2, '0');
    const dados = mesas[num] || { status: 'livre' };
    const status = dados.status || 'livre';

    const card = document.createElement('div');
    card.className = `mesa-card-novo ${status}`;
    card.onclick = () => abrirMesaCx(num);

    let infoHtml = '';
    if (status === 'ocupada' && dados.abertoEm) {
      const mins = Math.floor((Date.now() - dados.abertoEm) / 60000);
      infoHtml = `<div class="mesa-info">${mins}min</div>`;
    } else if (status === 'conta' && dados.total) {
      infoHtml = `<div class="mesa-info">R$ ${dados.total.toFixed(2).replace('.', ',')}</div>`;
    }

    const statusTxt = {
      livre: 'Livre',
      ocupada: 'Ocupada',
      conta: 'Conta'
    }[status];

    card.innerHTML = `
      <div class="mesa-num">${num}</div>
      <div class="mesa-status-txt">${statusTxt}</div>
      ${infoHtml}
    `;
    grid.appendChild(card);
  }

  atualizarStatsMesas();
}

function atualizarStatsMesas() {
  const numMesas = parseInt(localStorage.getItem('numMesas') || '16', 10);
  const mesas = JSON.parse(localStorage.getItem('mesas') || '{}');
  let livres = 0, ocup = 0, conta = 0;

  for (let i = 1; i <= numMesas; i++) {
    const num = String(i).padStart(2, '0');
    const s = (mesas[num] || {}).status || 'livre';
    if (s === 'livre') livres++;
    else if (s === 'ocupada') ocup++;
    else if (s === 'conta') conta++;
  }

  const l = document.getElementById('c-stat-livre');
  const o = document.getElementById('c-stat-ocup');
  const c = document.getElementById('c-stat-conta');
  if (l) l.textContent = `${livres} livres`;
  if (o) o.textContent = `${ocup} ocupadas`;
  if (c) c.textContent = `${conta} conta`;
}

// ═══════════════════════════════════════════════════════════════
// FUNÇÕES NOVAS — BALCÃO / DELIVERY / TELEFONE
// (Adicione isto no FINAL do seu script.js existente)
// ═══════════════════════════════════════════════════════════════

// Estado para balcão/delivery/telefone
window.balcoes = window.balcoes || [];
window.deliveryList = window.deliveryList || [];
window.telefoneList = window.telefoneList || [];

/* ── BALCÃO ── */
window.novoBalcão = function() {
  const num = String(balcoes.length + 1).padStart(2, '0');
  const id = 'B' + num;
  const nomePersonalizado = (prompt('Nome do cliente (opcional, deixe em branco se não souber):') || '').trim();
  balcoes.push({
    id, numero: num, abertoEm: Date.now(), nomePersonalizado,
    total: 0, itens: [], status: 'aberto'
  });
  salvarBalcoes();
  // Cria a mesa virtual do balcão — mesmo fluxo completo das mesas
  mesas.push({ id, status:'ocupada', inicio:Date.now(), pedido:[], virtual:true, canal:'balcao', nomeCliente:nomePersonalizado });
  renderizarBalcoes();
  mostrarAlerta(`Balcão ${num} aberto!`, 'verde');
  abrirMesaCx(id);
};

function renderizarBalcoes() {
  const lista = document.getElementById('balcaoList');
  if (!lista) return;

  if (balcoes.length === 0) {
    lista.innerHTML = `<div class="balcao-empty">Nenhum balcão aberto</div>`;
    return;
  }

  lista.innerHTML = '';
  balcoes.forEach((b, idx) => {
    const mins = Math.floor((Date.now() - b.abertoEm) / 60000);
    const card = document.createElement('div');
    card.className = 'balcao-card';
    card.onclick = () => {
      // Abre como se fosse uma mesa
      abrirMesaCx('B' + b.numero);
    };
    card.innerHTML = `
      <div>
        <div class="balcao-nome">Balcão ${b.numero}${b.nomePersonalizado?' — '+b.nomePersonalizado:''}</div>
        <div class="balcao-info">R$ ${(b.total||0).toFixed(2).replace('.', ',')} · ${mins}min</div>
      </div>
      <span class="badge badge-aberto">Aberto</span>
    `;
    lista.appendChild(card);
  });

  const proxNum = String(balcoes.length + 1).padStart(2, '0');
  const btn = document.createElement('button');
  btn.className = 'btn-outline-novo';
  btn.textContent = `+ Abrir balcão ${proxNum}`;
  btn.onclick = novoBalcão;
  lista.appendChild(btn);
}

function salvarBalcoes() {
  localStorage.setItem('balcoes', JSON.stringify(balcoes));
}

function carregarBalcoes() {
  try { balcoes = JSON.parse(localStorage.getItem('balcoes') || '[]'); }
  catch { balcoes = []; }
}

/* ── DELIVERY / TELEFONE ── */
let _tipoNovoPedido = 'delivery';

/* ── Carrinho de produtos dentro do modal Novo Pedido (delivery/telefone) ── */
window._carrinhoPedidoModal = [];

window.buscarProdutoModalPedido = function(termo){
  const box = document.getElementById('np-resultados-produto');
  termo = (termo||'').trim().toLowerCase();
  if(!termo){ box.style.display='none'; box.innerHTML=''; return; }
  const resultados = [];
  categoriasCx.forEach(c=>{
    (c.produtos||[]).forEach(p=>{
      if(p.nome.toLowerCase().includes(termo)) resultados.push({p, catNome:c.nome});
    });
  });
  box.style.display = 'block';
  if(!resultados.length){
    box.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--txt2);">Nenhum produto encontrado</div>';
    return;
  }
  box.innerHTML = resultados.slice(0,25).map((r,i)=>{
    const idx = window._resultadosBuscaTemp ? window._resultadosBuscaTemp.length : 0;
    if(r.p.tamanhos){
      return `<div style="padding:7px 10px;border-bottom:1px solid #232a25;font-size:12px;">
        <div style="font-weight:600;margin-bottom:4px;">${r.p.nome}</div>
        <div style="display:flex;gap:5px;">
          <button type="button" class="btn" style="font-size:11px;padding:5px 8px;" onclick="adicionarProdutoModalPedido(${i},'M')">M ${fmt(r.p.tamanhos.M)}</button>
          <button type="button" class="btn" style="font-size:11px;padding:5px 8px;" onclick="adicionarProdutoModalPedido(${i},'G')">G ${fmt(r.p.tamanhos.G)}</button>
          <button type="button" class="btn" style="font-size:11px;padding:5px 8px;" onclick="adicionarProdutoModalPedido(${i},'GG')">GG ${fmt(r.p.tamanhos.GG)}</button>
        </div>
      </div>`;
    }
    return `<div style="padding:8px 10px;border-bottom:1px solid #232a25;font-size:12px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="adicionarProdutoModalPedido(${i})">
      <span>${r.p.nome}</span><span style="color:var(--verde);font-weight:600;">${fmt(r.p.preco)}</span>
    </div>`;
  }).join('');
  window._resultadosBuscaTemp = resultados;
};

window.adicionarProdutoModalPedido = function(idx, tamanho){
  const r = (window._resultadosBuscaTemp||[])[idx];
  if(!r) return;
  const p = r.p;
  let preco = p.preco, nomeFinal = p.nome;
  if(tamanho && p.tamanhos){ preco = p.tamanhos[tamanho]; nomeFinal = p.nome+' ('+tamanho+')'; }
  const existente = window._carrinhoPedidoModal.find(i=>i.nome===nomeFinal);
  if(existente) existente.qtd++;
  else window._carrinhoPedidoModal.push({nome:nomeFinal, preco, qtd:1});
  document.getElementById('np-busca-produto').value='';
  document.getElementById('np-resultados-produto').style.display='none';
  document.getElementById('np-resultados-produto').innerHTML='';
  renderCarrinhoModalPedido();
};

window.removerProdutoModalPedido = function(idx){
  window._carrinhoPedidoModal.splice(idx,1);
  renderCarrinhoModalPedido();
};

window.ajustarQtdModalPedido = function(idx,delta){
  const it = window._carrinhoPedidoModal[idx];
  if(!it) return;
  it.qtd += delta;
  if(it.qtd<=0) window._carrinhoPedidoModal.splice(idx,1);
  renderCarrinhoModalPedido();
};

function renderCarrinhoModalPedido(){
  const lista = document.getElementById('np-carrinho-lista');
  const carrinho = window._carrinhoPedidoModal;
  if(!lista) return;
  if(!carrinho.length){
    lista.innerHTML = '<div style="font-size:12px;color:var(--txt2);text-align:center;padding:10px;">Nenhum produto adicionado ainda</div>';
  }else{
    lista.innerHTML = carrinho.map((it,idx)=>`
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:6px 0;border-bottom:1px solid #232a25;">
        <span>${it.nome}</span>
        <div style="display:flex;align-items:center;gap:6px;">
          <button type="button" onclick="ajustarQtdModalPedido(${idx},-1)" style="background:#1f2521;border:1px solid #313a33;border-radius:6px;width:22px;height:22px;cursor:pointer;color:var(--txt);font-size:13px;">-</button>
          <span style="min-width:14px;text-align:center;font-weight:600;">${it.qtd}</span>
          <button type="button" onclick="ajustarQtdModalPedido(${idx},1)" style="background:#1f2521;border:1px solid #313a33;border-radius:6px;width:22px;height:22px;cursor:pointer;color:var(--txt);font-size:13px;">+</button>
          <span style="color:var(--verde);font-weight:600;min-width:64px;text-align:right;">${fmt(it.preco*it.qtd)}</span>
          <button type="button" onclick="removerProdutoModalPedido(${idx})" style="background:none;border:none;color:var(--txt2);cursor:pointer;font-size:16px;">×</button>
        </div>
      </div>`).join('');
  }
  const total = carrinho.reduce((s,i)=>s+i.preco*i.qtd,0);
  document.getElementById('np-carrinho-total').textContent = fmt(total);
}

window.abrirModalNovoPedido = function(tipo) {
  _tipoNovoPedido = tipo;
  const titulo = document.getElementById('modal-np-titulo');
  const sub = document.getElementById('modal-np-sub');

  if (tipo === 'delivery') {
    titulo.textContent = '📱 Novo Pedido Delivery';
    sub.textContent = 'Pedido via WhatsApp';
  } else {
    titulo.textContent = '📞 Novo Pedido Telefone';
    sub.textContent = 'Pedido por ligação';
  }

  ['np-nome', 'np-telefone', 'np-endereco-novo', 'np-endereco-label', 'np-km', 'np-taxa', 'np-troco', 'np-obs', 'np-busca-produto'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('np-cliente-info').style.display='none';
  document.getElementById('np-resultados-produto').style.display='none';
  document.getElementById('np-resultados-produto').innerHTML='';
  document.getElementById('np-nome-resultados').style.display='none';
  document.getElementById('np-nome-resultados').innerHTML='';
  document.getElementById('np-pedidos-anteriores').style.display='none';
  document.getElementById('np-pedidos-anteriores').innerHTML='';
  window._pedidosAnterioresTemp = [];
  window._enderecosClientePedido = [];
  window._carrinhoPedidoModal = [];
  preencherEnderecosPedido([]);
  renderCarrinhoModalPedido();

  abrirModal('modal-novo-pedido');
};

/* ── Pizza Meio a Meio dentro do modal Novo Pedido (delivery/telefone) ── */
let mmpTamanho = null;
let mmpSabor1 = null;
let mmpItemPendente = null;

window.abrirMeioAMeioPedido = function(){
  mmpSabor1 = null;
  mmpTamanho = null;
  abrirModal('modal-mmp-tamanho');
};

window.escolherTamMMP = function(tam){
  mmpTamanho = tam;
  fecharModal('modal-mmp-tamanho');
  filtrarMMP1('trad');
  abrirModal('modal-mmp-sabor1');
};

function renderListaMMP(containerId, tipo, onClickFn){
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const lista = tipo === 'trad' ? pizzasTradCx : pizzasEspCx;
  lista.forEach(p=>{
    const metade = p.tamanhos[mmpTamanho] / 2;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.cssText = 'text-align:left;padding:11px 14px;font-size:13px;width:100%;';
    btn.innerHTML = '<span style="font-weight:600;">'+p.nome+'</span><br><span style="font-size:11px;color:var(--verde);">½ = '+fmt(metade)+'</span>';
    btn.onclick = () => onClickFn({nome:p.nome, metade});
    container.appendChild(btn);
  });
}

window.filtrarMMP1 = function(tipo){
  document.getElementById('mmp1-btn-trad').className = 'btn'+(tipo==='trad'?' btn-azul':'');
  document.getElementById('mmp1-btn-esp').className = 'btn'+(tipo==='esp'?' btn-azul':'');
  renderListaMMP('mmp1-lista', tipo, (it)=>{
    mmpSabor1 = it;
    document.getElementById('mmp2-sabor1-info').textContent = '1º: '+it.nome+' ('+fmt(it.metade)+')';
    fecharModal('modal-mmp-sabor1');
    filtrarMMP2('trad');
    abrirModal('modal-mmp-sabor2');
  });
};

window.filtrarMMP2 = function(tipo){
  document.getElementById('mmp2-btn-trad').className = 'btn'+(tipo==='trad'?' btn-azul':'');
  document.getElementById('mmp2-btn-esp').className = 'btn'+(tipo==='esp'?' btn-azul':'');
  renderListaMMP('mmp2-lista', tipo, (it)=>{
    fecharModal('modal-mmp-sabor2');
    const total = mmpSabor1.metade + it.metade;
    const nome = '½ '+mmpSabor1.nome+' / ½ '+it.nome;
    const tam = mmpTamanho;
    mmpSabor1 = null; mmpTamanho = null;
    setTimeout(()=>abrirBordaMMP(nome, tam, total), 200);
  });
};

function abrirBordaMMP(nome, tam, preco){
  mmpItemPendente = { nome, tamanhoObs: tam, preco };
  document.getElementById('mmp-borda-pizza-nome').textContent = nome;
  document.getElementById('mmp-borda-tam-info').textContent = 'Tamanho: '+tam+' — '+fmt(preco);
  const ops = document.getElementById('mmp-borda-opcoes');
  ops.innerHTML = '';
  Object.entries(BORDAS_CX).forEach(([bordaNome, precos])=>{
    const precoBorda = precos[tam] || 0;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.cssText = 'text-align:left;padding:13px 16px;font-size:14px;font-weight:600;width:100%;';
    btn.textContent = 'Borda de '+bordaNome+' — +'+fmt(precoBorda);
    btn.onclick = () => { fecharModal('modal-mmp-borda'); finalizarItemMMP(tam+' + Borda de '+bordaNome, preco+precoBorda); };
    ops.appendChild(btn);
  });
  abrirModal('modal-mmp-borda');
}

window.semBordaMMP = function(){
  fecharModal('modal-mmp-borda');
  if(!mmpItemPendente) return;
  finalizarItemMMP(mmpItemPendente.tamanhoObs, mmpItemPendente.preco);
};

function finalizarItemMMP(obsFinal, precoFinal){
  const p = mmpItemPendente;
  if(!p) return;
  const nomeFinal = p.nome+' ('+obsFinal+')';
  const existente = window._carrinhoPedidoModal.find(i=>i.nome===nomeFinal);
  if(existente) existente.qtd++;
  else window._carrinhoPedidoModal.push({nome:nomeFinal, preco:precoFinal, qtd:1});
  renderCarrinhoModalPedido();
  mmpItemPendente = null;
}

// Busca cliente já cadastrado pelo NOME (complementa a busca por telefone).
// Mostra sugestões e, ao clicar, preenche telefone + endereços salvos.
window.buscarClienteModalPorNome = function(termo){
  const box = document.getElementById('np-nome-resultados');
  termo = (termo||'').trim().toLowerCase();
  if(termo.length < 2){ box.style.display='none'; box.innerHTML=''; return; }
  const db = carregarClientesDB();
  const resultados = Object.values(db).filter(c => (c.nome||'').toLowerCase().includes(termo));
  if(!resultados.length){ box.style.display='none'; box.innerHTML=''; return; }
  box.style.display = 'block';
  box.innerHTML = resultados.slice(0,8).map(c => `
    <div style="padding:8px 10px;border-bottom:1px solid #232a25;font-size:12px;cursor:pointer;display:flex;justify-content:space-between;"
      onclick="selecionarClienteBuscaNome('${c.telefone}')">
      <span>${c.nome}</span><span style="color:var(--txt2);">${c.telefone}</span>
    </div>`).join('');
};

window.selecionarClienteBuscaNome = function(telefone){
  document.getElementById('np-telefone').value = telefone;
  document.getElementById('np-nome-resultados').style.display = 'none';
  document.getElementById('np-nome-resultados').innerHTML = '';
  aoDigitarTelefonePedido();
};

// Busca cliente pelo telefone digitado e preenche nome/endereços salvos
window.aoDigitarTelefonePedido = function(){
  const tel = document.getElementById('np-telefone').value;
  const info = document.getElementById('np-cliente-info');
  if(normalizarTel(tel).length < 8){ info.style.display='none'; renderPedidosAnterioresCliente(null); return; }
  const cli = buscarCliente(tel);
  if(cli){
    if(!document.getElementById('np-nome').value.trim()) document.getElementById('np-nome').value = cli.nome || '';
    preencherEnderecosPedido(cli.enderecos||[]);
    info.textContent = '✓ Cliente encontrado: '+cli.nome+' — '+(cli.enderecos||[]).length+' endereço(s) salvo(s)';
    info.style.display='block';
    renderPedidosAnterioresCliente(cli);
  }else{
    info.style.display='none';
    preencherEnderecosPedido([]);
    renderPedidosAnterioresCliente(null);
  }
};

// Mostra os últimos pedidos do cliente com botão "Pedir de novo" — repete exatamente os
// mesmos produtos no carrinho. Se não for o mesmo pedido, o usuário simplesmente ignora
// e busca outro produto normalmente.
function renderPedidosAnterioresCliente(cli){
  const box = document.getElementById('np-pedidos-anteriores');
  const pedidos = (cli && cli.pedidos) || [];
  if(!pedidos.length){ box.style.display='none'; box.innerHTML=''; window._pedidosAnterioresTemp=[]; return; }
  window._pedidosAnterioresTemp = pedidos;
  box.style.display = 'block';
  box.innerHTML = `<div style="padding:7px 10px;font-size:11px;font-weight:700;color:var(--txt2);border-bottom:1px solid #232a25;">🔁 Pedidos anteriores desse cliente</div>` +
    pedidos.slice(0,5).map((ped,idx)=>{
      const dataFmt = new Date(ped.data).toLocaleDateString('pt-BR');
      const itensTxt = ped.itens.map(it=>it.qtd+'x '+it.nome).join(', ');
      return `<div style="padding:8px 10px;border-bottom:1px solid #232a25;font-size:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="color:var(--txt2);font-size:10px;">${dataFmt}</div>
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${itensTxt}</div>
        </div>
        <button type="button" onclick="usarPedidoAnterior(${idx})"
          style="flex-shrink:0;padding:6px 10px;background:linear-gradient(180deg,#274f88,#1b3158);border:1px solid var(--azul);border-radius:8px;color:#aad4ff;font-size:11px;font-weight:700;cursor:pointer;">
          Pedir de novo
        </button>
      </div>`;
    }).join('');
}

// Carrega os itens de um pedido anterior no carrinho atual (soma, não substitui, caso
// já tenha algo adicionado). Se o cliente quiser outra coisa, ele ignora e busca normal.
window.usarPedidoAnterior = function(idx){
  const ped = (window._pedidosAnterioresTemp||[])[idx];
  if(!ped) return;
  ped.itens.forEach(it=>{
    const existente = window._carrinhoPedidoModal.find(i=>i.nome===it.nome);
    if(existente) existente.qtd += it.qtd;
    else window._carrinhoPedidoModal.push({nome:it.nome, preco:it.preco, qtd:it.qtd});
  });
  renderCarrinhoModalPedido();
  mostrarAlerta('Pedido anterior adicionado ao carrinho', 'verde');
};

function preencherEnderecosPedido(enderecos){
  window._enderecosClientePedido = enderecos;
  const sel = document.getElementById('np-endereco-select');
  sel.innerHTML = enderecos.map(e=>`<option value="${e.id}">📍 ${e.label} — ${e.endereco}</option>`).join('')
    + '<option value="__novo__">+ Novo endereço</option>';
  if(enderecos.length){
    sel.value = enderecos[0].id;
  }
  selecionarEnderecoPedido();
}

window.selecionarEnderecoPedido = function(){
  const sel = document.getElementById('np-endereco-select');
  const val = sel.value;
  const box = document.getElementById('np-endereco-novo-box');
  if(val === '__novo__' || !val){
    box.style.display = 'flex';
    document.getElementById('np-endereco-novo').value='';
    document.getElementById('np-endereco-label').value='';
    document.getElementById('np-km').value='';
    document.getElementById('np-taxa').value='';
  }else{
    box.style.display = 'none';
    const end = (window._enderecosClientePedido||[]).find(e=>e.id===val);
    if(end){
      document.getElementById('np-km').value = end.km||'';
      document.getElementById('np-taxa').value = end.taxa||'';
    }
  }
};

window.confirmarNovoPedido = function() {
  try{
    const nome = document.getElementById('np-nome').value.trim();
    const tel = document.getElementById('np-telefone').value.trim();
    const pag = document.getElementById('np-pagamento').value;
    const troco = parseFloat(document.getElementById('np-troco').value) || 0;
    const obs = document.getElementById('np-obs').value.trim();
    const km = parseFloat(document.getElementById('np-km').value) || 0;
    const taxa = parseFloat(document.getElementById('np-taxa').value) || 0;

    const selVal = document.getElementById('np-endereco-select').value;
    const enderecosCliente = window._enderecosClientePedido || [];
    let enderecoObj = null, enderecoFinal = '', labelFinal = '';

    if(selVal && selVal !== '__novo__'){
      enderecoObj = enderecosCliente.find(e=>e.id===selVal);
      if(enderecoObj){ enderecoFinal = enderecoObj.endereco; labelFinal = enderecoObj.label; }
    }
    if(!enderecoFinal){
      enderecoFinal = document.getElementById('np-endereco-novo').value.trim();
      labelFinal = document.getElementById('np-endereco-label').value.trim() || ('Endereço '+(enderecosCliente.length+1));
    }

    if (!nome) { mostrarAlerta('Informe o nome do cliente', 'vermelho'); return; }
    if (!tel) { mostrarAlerta('Informe o telefone do cliente', 'vermelho'); return; }
    if (!enderecoFinal) { mostrarAlerta('Informe ou selecione um endereço', 'vermelho'); return; }
    if (!window._carrinhoPedidoModal.length) { mostrarAlerta('Adicione pelo menos um produto ao pedido', 'vermelho'); return; }

    // Salva/atualiza o cliente e o endereço usado (fica salvo para pedidos futuros)
    salvarOuAtualizarCliente({ nome, telefone: tel, endereco:{ label:labelFinal, endereco:enderecoFinal, km, taxa } });

    const canal = _tipoNovoPedido; // 'delivery' (whatsapp) ou 'telefone'
    const id = (canal === 'delivery' ? 'D' : 'T') + Date.now();

    // Converte o carrinho do modal para o formato usado pelas mesas (cozinha/fechamento)
    const itensPedido = window._carrinhoPedidoModal.map(it=>({
      nome: it.nome, preco: it.preco, qtd: it.qtd, obs:'', categoria:'',
      setor:'cozinha', enviadoCozinha:false, criadoEm: Date.now()
    }));
    const totalItens = itensPedido.reduce((s,i)=>s+i.preco*i.qtd,0);

    // Guarda os produtos deste pedido no histórico do cliente, pra sugerir "pedir de novo"
    salvarPedidoHistoricoCliente(tel, itensPedido, totalItens);

    const pedido = {
      id, tipo: canal, nome, telefone: tel,
      endereco: enderecoFinal, enderecoLabel: labelFinal, km, taxa,
      pagamento: pag, trocoPara: troco, observacao: obs,
      abertoEm: Date.now(), total: totalItens, itens: itensPedido, status: 'aguardando'
    };

    if (canal === 'delivery') {
      deliveryList.push(pedido);
      localStorage.setItem('deliveryList', JSON.stringify(deliveryList));
      renderizarDelivery();
    } else {
      telefoneList.push(pedido);
      localStorage.setItem('telefoneList', JSON.stringify(telefoneList));
      renderizarTelefone();
    }

    // Cria a "mesa virtual" já com os produtos escolhidos, reaproveitando 100% do
    // fluxo de mesa: enviar pra cozinha, fechar total ou parcial.
    const novaMesa = {
      id, status: 'ocupada', inicio: Date.now(), pedido: itensPedido,
      virtual: true, canal, nomeCliente: nome, telefoneCliente: tel,
      endereco: enderecoFinal, km, taxa, observacao: obs
    };
    mesas.push(novaMesa);
    salvarMesaCx(novaMesa);

    fecharModal('modal-novo-pedido');
    mostrarAlerta(`Pedido de ${nome} criado — ${fmt(totalItens)}`, 'verde');
  }catch(e){
    console.error('Erro ao criar pedido:', e);
    alert('Erro ao criar o pedido: '+e.message);
  }
};

function renderizarDelivery() {
  const lista = document.getElementById('deliveryList');
  if (!lista) return;

  if (deliveryList.length === 0) {
    lista.innerHTML = `<div class="balcao-empty">Nenhum pedido delivery</div>`;
    return;
  }

  lista.innerHTML = '';
  deliveryList.forEach((p, idx) => {
    const mins = Math.floor((Date.now() - p.abertoEm) / 60000);
    const badgeClasse = {
      aguardando: 'badge-aguardando', preparando: 'badge-preparando',
      emrota: 'badge-emrota', entregue: 'badge-verde', atrasado: 'badge-atrasado'
    }[p.status] || 'badge-aguardando';

    const statusTxt = {
      aguardando: 'Aguardando', preparando: 'Na cozinha',
      emrota: 'Em rota', entregue: 'Entregue', atrasado: 'Atrasado'
    }[p.status] || 'Aguardando';

    let info = `${p.endereco || ''} · R$ ${(p.total||0).toFixed(2).replace('.', ',')} · ${mins}min<br>`;
    info += { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' }[p.pagamento] || p.pagamento;
    if (p.pagamento === 'dinheiro' && p.trocoPara > 0) {
      info += ` (troco p/ R$ ${p.trocoPara.toFixed(2).replace('.', ',')})`;
    }

    const card = document.createElement('div');
    card.className = `pedido-card ${p.status}`;
    card.onclick = () => abrirMesaCx(p.id);
    card.innerHTML = `
      <div class="pedido-header">
        <div class="pedido-nome">${p.nome}</div>
        <span class="badge ${badgeClasse}">${statusTxt}</span>
      </div>
      <div class="pedido-info">${info}</div>
      <button type="button" onclick="concluirPedidoCard(event,'${p.id}','delivery')"
        style="width:100%;margin-top:8px;padding:8px;background:linear-gradient(180deg,#2aa160,#1d7b49);border:1px solid #258754;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">
        ✓ Concluir (entregue)
      </button>
    `;
    lista.appendChild(card);
  });

  const btn = document.createElement('button');
  btn.className = 'btn-outline-novo';
  btn.textContent = '+ Novo pedido delivery';
  btn.onclick = () => abrirModalNovoPedido('delivery');
  lista.appendChild(btn);
}

function renderizarTelefone() {
  const lista = document.getElementById('telefoneList');
  if (!lista) return;

  if (telefoneList.length === 0) {
    lista.innerHTML = `<div class="balcao-empty">Nenhum pedido telefone</div>`;
    return;
  }

  lista.innerHTML = '';
  telefoneList.forEach((p, idx) => {
    const mins = Math.floor((Date.now() - p.abertoEm) / 60000);
    const badgeClasse = {
      aguardando: 'badge-aguardando', preparando: 'badge-preparando',
      entregue: 'badge-verde', atrasado: 'badge-atrasado'
    }[p.status] || 'badge-aguardando';

    const statusTxt = {
      aguardando: 'Aguardando', preparando: 'Na cozinha', entregue: 'Entregue', atrasado: 'Atrasado'
    }[p.status] || 'Aguardando';

    let info = `${p.endereco || ''} · R$ ${(p.total||0).toFixed(2).replace('.', ',')} · ${mins}min<br>`;
    info += { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' }[p.pagamento] || p.pagamento;

    const card = document.createElement('div');
    card.className = `pedido-card ${p.status}`;
    card.onclick = () => abrirMesaCx(p.id);
    card.innerHTML = `
      <div class="pedido-header">
        <div class="pedido-nome">${p.nome}</div>
        <span class="badge ${badgeClasse}">${statusTxt}</span>
      </div>
      <div class="pedido-info">${info}</div>
      <button type="button" onclick="concluirPedidoCard(event,'${p.id}','telefone')"
        style="width:100%;margin-top:8px;padding:8px;background:linear-gradient(180deg,#2aa160,#1d7b49);border:1px solid #258754;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">
        ✓ Concluir (entregue)
      </button>
    `;
    lista.appendChild(card);
  });

  const btn = document.createElement('button');
  btn.className = 'btn-outline-novo';
  btn.textContent = '+ Novo pedido telefone';
  btn.onclick = () => abrirModalNovoPedido('telefone');
  lista.appendChild(btn);
}

/* ── INICIALIZAÇÃO ── */
// Reconecta balcões/delivery/telefone salvos (localStorage) ao sistema de mesas
// — necessário porque a lista de "mesas" em memória é recriada a cada carregamento de página.
async function restaurarMesasVirtuais(){
  const todas = [
    ...balcoes.map(b=>({...b, canal:'balcao'})),
    ...deliveryList.map(p=>({...p, canal:'delivery'})),
    ...telefoneList.map(p=>({...p, canal:'telefone'}))
  ];
  for(const item of todas){
    if(mesas.find(m=>m.id===item.id)) continue; // já reconectada
    let pedidoSalvo=[];
    try{
      const snap = await get(ref(db,'mesas/mesa'+item.id));
      const dados = snap.val();
      if(dados && dados.pedido) pedidoSalvo = Object.values(dados.pedido);
    }catch(e){ /* sem conexão, segue com pedido vazio */ }
    mesas.push({
      id:item.id, status:'ocupada', inicio:item.abertoEm||Date.now(), pedido:pedidoSalvo,
      virtual:true, canal:item.canal,
      nomeCliente:item.nome||item.nomePersonalizado||'',
      telefoneCliente:item.telefone||'', endereco:item.endereco||'',
      km:item.km||0, taxa:item.taxa||0, observacao:item.observacao||''
    });
  }
  renderMesasCaixa();
}

function inicializarNovoLayout() {
  carregarBalcoes();
  try {
    deliveryList = JSON.parse(localStorage.getItem('deliveryList') || '[]');
    telefoneList = JSON.parse(localStorage.getItem('telefoneList') || '[]');
  } catch {
    deliveryList = [];
    telefoneList = [];
  }

  renderizarBalcoes();
  renderizarDelivery();
  renderizarTelefone();
  restaurarMesasVirtuais();

  setInterval(() => {
    renderizarBalcoes();
    renderizarDelivery();
    renderizarTelefone();
  }, 60000);
}

// Inicializa quando carregar
setTimeout(inicializarNovoLayout, 1000);
