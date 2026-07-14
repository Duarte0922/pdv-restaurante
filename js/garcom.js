// garcom.js - VERSÃO FINAL CORRIGIDA
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, setPersistence, browserLocalPersistence }
from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, set, onValue, update, push, get, query, orderByChild, equalTo, onChildAdded, onChildChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";const FB = {
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
setPersistence(auth, browserLocalPersistence);

window.fazerLogin = function(tipo) {
  const email = tipo === 'garcom' ? 'garcom@luar.com' : 'caixa@luar.com';
  signInWithEmailAndPassword(auth, email, '123456')
    .then(() => console.log("Conectado como " + tipo))
    .catch((error) => alert("Erro: " + error.message));
};

onAuthStateChanged(auth, (user) => {
  const appEl = document.getElementById('app');
  const loginEl = document.getElementById('login-screen');
  if (user) {
    if(appEl) appEl.style.display = 'flex';
    if(loginEl) loginEl.style.display = 'none';
  } else {
    if(appEl) appEl.style.display = 'none';
    if(loginEl) loginEl.style.display = 'flex';
  }
});

const fmt = v => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
const abrirModal = id => document.getElementById(id).classList.add('open');
const fecharModal = id => document.getElementById(id).classList.remove('open');
window.fecharModal = fecharModal;

function normalizarTel(t){ return (t||'').replace(/\D/g,''); }
let clientesCache = {};
onValue(ref(db,'clientes'), snap => { clientesCache = snap.val() || {}; });
function carregarClientesDB(){ return clientesCache; }
function buscarCliente(tel){
  const key=normalizarTel(tel);
  if(!key) return null;
  return clientesCache[key]||null;
}
window.buscarCliente=buscarCliente;

function salvarOuAtualizarCliente({nome,telefone,endereco}){
  const key=normalizarTel(telefone);
  if(!key) return null;
  const atual = clientesCache[key] || {nome,telefone,enderecos:[]};
  const registro = {...atual};
  registro.enderecos = [...(atual.enderecos||[])];
  if(nome) registro.nome=nome;
  registro.telefone=telefone;
  if(endereco && endereco.endereco){
    const norm=endereco.endereco.trim().toLowerCase();
    const idx=registro.enderecos.findIndex(e=>e.endereco.trim().toLowerCase()===norm);
    if(idx>=0){
      registro.enderecos[idx] = {...registro.enderecos[idx],
        label: endereco.label||registro.enderecos[idx].label,
        km: endereco.km||registro.enderecos[idx].km,
        taxa: endereco.taxa||registro.enderecos[idx].taxa};
    }else{
      registro.enderecos.push({
        id:'E'+Date.now(),
        label:endereco.label||('Endereço '+(registro.enderecos.length+1)),
        endereco:endereco.endereco, km:endereco.km||0, taxa:endereco.taxa||0
      });
    }
  }
  clientesCache[key] = registro;
  set(ref(db,'clientes/'+key), registro).catch(e=>console.warn('Erro ao salvar cliente:',e));
  return registro;
}

function salvarPedidoHistoricoCliente(telefone, itens, total){
  const key=normalizarTel(telefone);
  if(!key || !itens || !itens.length) return;
  const atual = clientesCache[key];
  if(!atual) return;
  const registro = {...atual};
  registro.pedidos = [{data: Date.now(), itens: itens.map(it=>({nome:it.nome, preco:it.preco, qtd:it.qtd})), total}, ...(atual.pedidos||[])].slice(0,8);
  clientesCache[key] = registro;
  set(ref(db,'clientes/'+key), registro).catch(e=>console.warn('Erro ao salvar histórico:',e));
}
window.salvarPedidoHistoricoCliente = salvarPedidoHistoricoCliente;

let mesas=[];
const hoje=new Date().toLocaleDateString('pt-BR').replace(/\//g,'-');

window.mudarAba=function(aba){
  document.querySelectorAll('.aba').forEach((el,i)=>{
    el.classList.toggle('ativa', i===0);
  });
  document.querySelectorAll('.aba-content').forEach(el=>el.classList.remove('ativa'));
  document.getElementById('aba-mesas').classList.add('ativa');
};

function renderMesasCaixa(){
  const grid=document.getElementById('mesasGridNovo');
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
    el.innerHTML=`<div style="font-size:13px;font-weight:700;color:${cor};">Mesa ${String(m.id).padStart(2,'0')}</div><div style="font-size:10px;color:${cor};margin:2px 0;">${m.status==='livre'?'Livre':m.status==='ocupada'?'Ocupada':'Conta'}</div>${total>0?`<div style="font-size:12px;font-weight:700;color:${cor};">${fmt(total)}</div>`:''}`;
    el.onclick=()=>abrirMesaCx(m.id);
    grid.appendChild(el);
  });
  document.getElementById('c-stat-livre').textContent=liv+' livres';
  document.getElementById('c-stat-ocup').textContent=ocu+' ocupadas';
  document.getElementById('c-stat-conta').textContent=con+' conta';
}

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
  alert('✓ Número de mesas atualizado para '+n);
};

const BORDAS_CX = { 'Catupiry':{M:11,G:13,GG:15}, 'Cheddar/Catupiry':{M:12,G:14,GG:16} };

function gerarNomeImagem(nome) {
  return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[0-9\s-]+/g, '').replace(/\s+/g, '-').replace(/[^\w-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function gerarCaminhoImagemProduto(nomeProduto) {
  return `produtos/${gerarNomeImagem(nomeProduto)}.jpg`;
}

function adicionarImagem(produtos) {
  return produtos.map(p => ({...p, img: gerarCaminhoImagemProduto(p.nome)}));
}

const pizzasTradCx = ['01 - Frango c/ Catupiry','02 - Palmito á Bolonhesa','03 - Palmito c/ Catupiry','04 - Portuguesa','05 - Napolitana','06 - Calabresa','07 - Mussarela','08 - Á Moda','09 - Frango á Bolonhesa','10 - Presunto','11 - Vegetariana','12 - Bacon','13 - Bacon Milho','14 - Sugestão Renito','15 - Atum','16 - Chef Cheddar','17 - Espanta Vampiro'].map(n => ({nome:n, tamanhos:{M:40.90, G:52.90, GG:61.90}}));

const pizzasEspCx = ['18 - Lombo Tropical','19 - Lombo Canadense','20 - Milhombo','21 - A Moda Renito','22 - Quatro Queijo','23 - Salaminho Italiano','24 - Quatro Carnes','25 - Cinco Carnes','26 - Nordestina','27 - Porconobilis','28 - A Moda Especial'].map(n => ({nome:n, tamanhos:{M:45.90, G:57.90, GG:76.90}}));

const categoriasCx = [
  {nome:'Pizza Trad.', icon:'🍕', img:'img/pizza-trad.jpg', pizza:true, produtos: adicionarImagem(pizzasTradCx)},
  {nome:'Pizza Esp.', icon:'🌟', img:'img/pizza-esp.jpg', pizza:true, produtos: adicionarImagem(pizzasEspCx)},
  {nome:'Sanduíches', icon:'🍔', img:'img/sanduiches.jpg', produtos: adicionarImagem([{nome:'01 - Hamburguer',preco:10},{nome:'02 - X-Burguer',preco:11},{nome:'03 - Misto Especial',preco:11},{nome:'04 - X-Bacon',preco:14},{nome:'05 - Framburguer',preco:14.5},{nome:'06 - X-Egg-Burguer',preco:14.5},{nome:'07 - X-Egg-Bacon',preco:16},{nome:'08 - X-Tudo',preco:17},{nome:'09 - Daliane',preco:23.5},{nome:'10 - 5 Carnes',preco:24.5},{nome:'11 - X-Tudão',preco:19.5},{nome:'12 - X-Frango',preco:19.5},{nome:'13 - Super X-Tudo',preco:24.5},{nome:'14 - RM Sanduíche',preco:25},{nome:'15 - LR Burguer',preco:26.5},{nome:'16 - Rangão',preco:28.5},{nome:'17 - Califórnia',preco:22.5},{nome:'18 - X-Bruno',preco:22.5},{nome:'19 - Chefe',preco:24.5},{nome:'20 - Patrão',preco:30.5},{nome:'21 - Ki-Frango',preco:24.5},{nome:'22 - Dom Geraldo',preco:29.5},{nome:'23 - São Carlos',preco:24.5},{nome:'24 - Dom Cleiton',preco:31.5},{nome:'25 - F-Kalll',preco:32.5},{nome:'26 - Marley',preco:25.5},{nome:'27 - Betoven',preco:35.5}])},
  {nome:'Porções', icon:'🍟', img:'img/porcoes.jpg', carne:true, produtos: adicionarImagem([{nome:'Fritas 400g Mussarela',preco:24.9},{nome:'Fritas 400g Muss./Bacon',preco:34.9},{nome:'Fritas 400g Muss./Bacon/Cala.',preco:49.9},{nome:'Carne de Sol c/ Fritas',preco:75.9},{nome:'Contra Filé c/ Fritas',preco:77.9},{nome:'Fígado com Jiló',preco:32.9},{nome:'Linguiça Caseira c/ Fritas',preco:55.9},{nome:'Pernil c/ Fritas/Mandioca',preco:55.9},{nome:'Arroz na Chapa',preco:24.9},{nome:'Arroz com Pernil',preco:36.9},{nome:'Porção Mista',preco:136.9},{nome:'Filé de Peito de Frango',preco:42.9},{nome:'Picanha',preco:96.9},{nome:'Costelinha c/ Mandioca',preco:67.9},{nome:'Coxinha da Asa 1kg',preco:50.9}])},
  {nome:'Peixes', icon:'🐟', img:'img/peixes.jpg', produtos: adicionarImagem([{nome:'Tilápia 400g Molho Especial',preco:53.9},{nome:'Tilápia 400g c/ Batata',preco:68.9},{nome:'Cascudo 800g Molho Especial',preco:46.9},{nome:'Cascudo 800g c/ Batata',preco:60.9},{nome:'Cascudo 400g Molho Especial',preco:23.9},{nome:'Cascudo 400g c/ Batata',preco:30.9}])},
  {nome:'Bebidas', icon:'🥤', img:'img/bebidas.jpg', produtos: adicionarImagem([{nome:'Suco de Caixinha',preco:5,bar:true},{nome:'Suco 1 Litro',preco:12},{nome:'Polpa Acerola/Abacaxi/Laranja/Morango',preco:7.5},{nome:'Polpa Graviola/Cacau/Maracujá/Açaí',preco:8},{nome:'Refri 1L Guaraná',preco:9,bar:true},{nome:'Refri 1L Coca-Cola',preco:12,bar:true},{nome:'Refri 2L Fanta/Guaraná',preco:15,bar:true},{nome:'Refri 2L Coca-Cola',preco:17,bar:true},{nome:'Refrigerante Lata',preco:6,bar:true}])},
  {nome:'Cervejas', icon:'🍺', img:'img/cervejas.jpg', produtos: adicionarImagem([{nome:'Brahma / Skol 600ml',preco:10,bar:true},{nome:'Kaiser 600ml',preco:8,bar:true},{nome:'Original 600ml',preco:13,bar:true},{nome:'Spaten / Stella 600ml',preco:14,bar:true},{nome:'Heineken 600ml',preco:16,bar:true},{nome:'Vinho Taça',preco:22.9,bar:true},{nome:'Vinho Garrafa',preco:22.9,bar:true},{nome:'Vinho Pergola Taça',preco:10.9,bar:true},{nome:'Vinho Pergola Garrafa',preco:45.9,bar:true},{nome:'White Horse',preco:15,bar:true},{nome:'Old Eight',preco:8,bar:true},{nome:'Caip Orlof — Abacaxi',preco:20},{nome:'Caip Orlof — Morango',preco:20},{nome:'Caip Orlof — Limão',preco:20},{nome:'Caip Orlof — Maracujá',preco:20},{nome:'Pinga 51',preco:5,bar:true},{nome:'Vodka Orlof',preco:7,bar:true}])},
  {nome:'Espaguete', icon:'🍝', img:'img/espaguete.jpg', produtos: adicionarImagem([{nome:'Espaguete na Chapa — Pequeno',preco:19.9},{nome:'Espaguete na Chapa — Grande',preco:29.9}])},
];

let mesaAtualCx = null, itemPendenteCx = null, carrinhoAbertoCx = true;
let mmTamanhoCx = null, mmSabor1Cx = null;

window.voltarMesasCaixa = function(){
  mesaAtualCx = null; // 🔴 LIMPA A MESA ATUAL
  const pedido = document.getElementById('screen-pedido');
  if(pedido){pedido.classList.remove('active');pedido.style.display='none';}
  const main = document.getElementById('screen-main');
  if(main){main.style.display = 'flex';main.classList.add('active');}
  mudarAba('mesas');
  renderMesasCaixa(); // 🔴 FORÇA RE-RENDERIZAÇÃO
};

function abrirMesaCx(id){
  mesaAtualCx = mesas.find(m=>m.id===id);
  if(!mesaAtualCx){
    mostrarAlerta('Mesa não encontrada', 'vermelho');
    return;
  }
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
  const buscaEl = document.getElementById('busca-produto-cx');
  if(buscaEl) buscaEl.value = '';
  const main = document.getElementById('screen-main');
  if(main){main.classList.remove('active');main.style.display='none';}
  const pedido = document.getElementById('screen-pedido');
  if(pedido){pedido.style.display='flex';pedido.classList.add('active');}
}

async function salvarMesaCx(mesa){
  if(mesa.virtual){
    const total=(mesa.pedido||[]).reduce((s,i)=>s+i.preco*i.qtd,0);
    if(mesa.canal==='balcao'){
      const b=balcoes.find(x=>x.id===mesa.id);
      if(b){ b.total=total; salvarPedidoAvulsoFirebase('balcao', b); renderizarBalcoes(); }
    }else if(mesa.canal==='delivery'){
      const p=deliveryList.find(x=>x.id===mesa.id);
      if(p){ p.total=total; salvarPedidoAvulsoFirebase('delivery', p); renderizarDelivery(); }
    }else if(mesa.canal==='telefone'){
      const p=telefoneList.find(x=>x.id===mesa.id);
      if(p){ p.total=total; salvarPedidoAvulsoFirebase('telefone', p); renderizarTelefone(); }
    }
  }
  try{
    const po={};(mesa.pedido||[]).forEach((it,i)=>po['i'+i]=it);
    await set(ref(db,'mesas/mesa'+mesa.id),{id:mesa.id,status:mesa.status,inicio:mesa.inicio,pedido:po});
  }catch(e){ console.warn('Erro ao salvar mesa:',e); }
}

function getIconHTML(cat, size = '32px'){
  if(cat.img){
    return `<img src="${cat.img}" alt="${cat.nome}" style="width:${size};height:${size};border-radius:8px;object-fit:cover;display:block;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><span style="display:none;font-size:${parseInt(size)*0.6}px;align-items:center;justify-content:center;width:${size};height:${size};">${cat.icon || '🍽️'}</span>`;
  }
  return `<span style="font-size:${parseInt(size)*0.6}px;">${cat.icon || '🍽️'}</span>`;
}

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
        const ph = p.tamanhos ? `<div class="produto-tamanhos">M ${fmt(p.tamanhos.M)} | G ${fmt(p.tamanhos.G)} | GG ${fmt(p.tamanhos.GG)}</div>` : `<div class="produto-preco">${fmt(p.preco)}</div>`;
        el.innerHTML = `<img src="${p.img||''}" alt="${p.nome}" class="produto-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="produto-no-img" style="display:none;">🍽️</div><div class="produto-info"><div class="produto-nome">${p.nome}</div>${ph}</div>`;
        el.onclick = ()=>adicionarItemCx(p, c.nome, c.pizza);
        grid.appendChild(el);
      }
    });
  });
  if(!achou){
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--txt2);font-size:13px;">Nenhum produto encontrado</div>';
  }
};

function renderCategoriasCx(){
  const list=document.getElementById('cat-list-cx');
  list.innerHTML='';
  categoriasCx.forEach((c,i)=>{
    const el=document.createElement('div');
    el.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:72px;border-radius:14px;padding:6px 3px;gap:4px;font-size:9px;line-height:1.2;text-align:center;border:1px solid var(--border3);background:linear-gradient(180deg,#232a25,#171c18);color:var(--txt);cursor:pointer;transition:all .15s;';
    el.innerHTML = `${getIconHTML(c, '36px')}<span style="font-weight:500;">${c.nome}</span>`;
    if(i===0){el.style.background='linear-gradient(180deg,#2f5e9f,#1f355c)';el.style.borderColor='var(--azul)';}
    el.onclick=()=>{
      document.querySelectorAll('#cat-list-cx div').forEach(b=>{b.style.background='linear-gradient(180deg,#232a25,#171c18)';b.style.borderColor='var(--border3)';});
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
  if(c.pizza){
    const btnMM = document.createElement('div');
    btnMM.style.cssText = 'grid-column:1/-1;background:linear-gradient(180deg,#1a3564,#102040);border:2px solid var(--azul);border-radius:14px;padding:13px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;margin-bottom:4px;';
    btnMM.innerHTML = '<span style="font-size:22px;">🍕</span><div><div style="font-weight:700;font-size:14px;color:#aad4ff;">Pizza Meio a Meio</div><div style="font-size:11px;color:var(--txt2);">Escolha 2 sabores — G ou GG</div></div>';
    btnMM.onclick = ()=>abrirMeioAMeioCx();
    grid.appendChild(btnMM);
  }
  c.produtos.forEach(p => {
    const el = document.createElement('div');
    el.className = 'produto-card';
    const ph = p.tamanhos ? `<div class="produto-tamanhos">M ${fmt(p.tamanhos.M)} | G ${fmt(p.tamanhos.G)} | GG ${fmt(p.tamanhos.GG)}</div>` : `<div class="produto-preco">${fmt(p.preco)}</div>`;
    el.innerHTML = `<img src="${p.img||''}" alt="${p.nome}" class="produto-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="produto-no-img" style="display:none;">🍽️</div><div class="produto-info"><div class="produto-nome">${p.nome}</div>${ph}</div>`;
    el.onclick = ()=>adicionarItemCx(p, c.nome, c.pizza);
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
    abrirModal('modal-tamanho-cx');
    return;
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
    btn.onclick=()=>{fecharModal('modal-borda-cx');confirmarPizzaComBordaCx('Borda de '+nome,precoBorda);};
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
    d.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:start;"><div style="flex:1;padding-right:4px;"><span style="font-weight:600;">${it.nome}</span>${it.obs?`<span style="font-size:10px;color:var(--txt2);"> — ${it.obs}</span>`:''}<div style="margin-top:4px;"><span style="background:${it.enviadoCozinha?'var(--verde-bg)':'#3a2e0a'};color:${it.enviadoCozinha?'var(--verde)':'#c9a427'};border-radius:999px;font-size:10px;padding:2px 7px;">${it.enviadoCozinha?'✓ Enviado':'⏳ Novo'}</span></div></div><button onclick="removerItemCx(${idx})" style="background:none;border:none;cursor:pointer;color:var(--txt2);font-size:20px;padding:0;line-height:1;">×</button></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px;"><div style="display:flex;align-items:center;gap:8px;"><button onclick="ajustarQtdCx(${idx},-1)" style="background:#1f2521;border:1px solid #313a33;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px;color:var(--txt);display:flex;align-items:center;justify-content:center;">-</button><span style="font-weight:700;min-width:16px;text-align:center;">${it.qtd}</span><button onclick="ajustarQtdCx(${idx},1)" style="background:#1f2521;border:1px solid #313a33;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px;color:var(--txt);display:flex;align-items:center;justify-content:center;">+</button></div><span style="color:var(--verde);font-weight:700;">${fmt(it.preco*it.qtd)}</span></div>`;
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

// 🔴 FUNÇÃO CORRIGIDA — Escreve DIRETO em comandas_imprimir
window.enviarCozinhaCx=async function(){
  if(!mesaAtualCx||!mesaAtualCx.pedido||!mesaAtualCx.pedido.length) return;
  const todos=mesaAtualCx.pedido.filter(it=>!it.enviadoCozinha&&it.setor!=='bar');
  if(!todos.length){
    document.getElementById('cozinha-msg-cx').textContent='Todos os itens já foram enviados.';
    abrirModal('modal-cozinha-cx');
    return;
  }
  const codigo=mesaAtualCx.id+'-'+Date.now().toString().slice(-5);
  const dados={
    mesa:mesaAtualCx.id,
    codigo,
    data:new Date().toLocaleString('pt-BR'),
    itens:todos.map(it=>({nome:it.nome,qtd:it.qtd,preco:it.preco,obs:it.obs||'',setor:it.setor||''}))
  };
  if(mesaAtualCx.virtual && (mesaAtualCx.canal==='delivery' || mesaAtualCx.canal==='telefone')){
    const listaCanal = mesaAtualCx.canal==='delivery' ? deliveryList : telefoneList;
    const pedidoCanal = listaCanal.find(x=>x.id===mesaAtualCx.id);
    dados.canal = mesaAtualCx.canal;
    dados.nomeCliente = mesaAtualCx.nomeCliente || '';
    dados.telefoneCliente = mesaAtualCx.telefoneCliente || '';
    dados.endereco = mesaAtualCx.endereco || '';
    dados.pagamento = pedidoCanal ? pedidoCanal.pagamento : '';
  }
  try{
    // 🔴 ESCREVE DIRETO EM comandas_imprimir — o Caixa imprime
    await push(ref(db,'comandas_imprimir'),{...dados, status:'pendente', timestamp:Date.now()});
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

// 🔴 LISTENERS FIREBASE
onValue(ref(db, 'config/numMesas'), (snap) => {
  const n = snap.val() || 16;
  const atuais = mesas.filter(m=>!m.virtual);
  if (n !== atuais.length) {
    console.log("Sincronizando número de mesas para: " + n);
    const virtuais = mesas.filter(m=>m.virtual);
    mesas = Array.from({ length: n }, (_, i) => ({id: i + 1,status: 'livre',inicio: null,pedido: []})).concat(virtuais);
    renderMesasCaixa();
  }
});

function aplicarDadosMesa(m){
  if(!m) return;
  const local = mesas.find(x => x.id === m.id);
  if (local) {
    local.status = m.status || 'livre';
    local.inicio = m.inicio || null;
    local.pedido = m.pedido ? Object.values(m.pedido) : [];
  }
  renderMesasCaixa();
}
onChildAdded(ref(db, 'mesas'), (snap) => aplicarDadosMesa(snap.val()));
onChildChanged(ref(db, 'mesas'), (snap) => aplicarDadosMesa(snap.val()));

onValue(ref(db, '.info/connected'), (snap) => {
  const el = document.getElementById('sync-indicator');
  const on = !!snap.val();
  if (el) {
    el.textContent = on ? '● Online' : '○ Offline';
    el.style.background = on ? 'var(--verde-bg)' : '#3a1a1a';
    el.style.color = on ? 'var(--verde)' : '#ff8080';
  }
});

let balcoes = [], deliveryList = [], telefoneList = [], pedidoAquiList = [];
window._tipoNovoPedido = 'delivery';

function salvarPedidoAvulsoFirebase(canal, obj){
  const caminho = canal==='balcao' ? 'balcoes' : canal==='delivery' ? 'delivery' : canal==='pedidoaqui' ? 'pedidoaqui' : 'telefone';
  set(ref(db, 'pedidos_avulsos/'+caminho+'/'+obj.id), obj).catch(e=>console.warn('Erro ao salvar pedido avulso:', e));
}
function removerPedidoAvulsoFirebase(canal, id){
  const caminho = canal==='balcao' ? 'balcoes' : canal==='delivery' ? 'delivery' : canal==='pedidoaqui' ? 'pedidoaqui' : 'telefone';
  set(ref(db, 'pedidos_avulsos/'+caminho+'/'+id), null).catch(e=>console.warn('Erro ao remover pedido avulso:', e));
}
onValue(ref(db,'pedidos_avulsos/balcoes'), snap=>{
  balcoes = Object.values(snap.val()||{});
  renderizarBalcoes();
  reconciliarMesasVirtuais();
});
onValue(ref(db,'pedidos_avulsos/delivery'), snap=>{
  deliveryList = Object.values(snap.val()||{});
  renderizarDelivery();
  reconciliarMesasVirtuais();
});
onValue(ref(db,'pedidos_avulsos/telefone'), snap=>{
  telefoneList = Object.values(snap.val()||{});
  renderizarTelefone();
  reconciliarMesasVirtuais();
});
onValue(ref(db,'pedidos_avulsos/pedidoaqui'), snap=>{
  pedidoAquiList = Object.values(snap.val()||{});
  renderizarPedidoAqui();
});

window.novoBalcão = function() {
  const numero = String(balcoes.length + 1).padStart(2, '0');
  const id = 'B' + Date.now();
  const nomePersonalizado = (prompt('Nome do cliente (opcional):') || '').trim();
  const balcaoObj = {id, numero, abertoEm: Date.now(), nomePersonalizado, total: 0, status: 'aberto'};
  balcoes.push(balcaoObj);
  salvarPedidoAvulsoFirebase('balcao', balcaoObj);
  mesas.push({ id, status:'ocupada', inicio:Date.now(), pedido:[], virtual:true, canal:'balcao', nomeCliente:nomePersonalizado, numero });
  renderizarBalcoes();
  mostrarAlerta(`Balcão ${numero} aberto!`, 'verde');
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
    card.onclick = ()=>abrirMesaCx(b.id);
    card.innerHTML = `<div><div class="balcao-nome">Balcão ${b.numero}${b.nomePersonalizado?' — '+b.nomePersonalizado:''}</div><div class="balcao-info">R$ ${(b.total||0).toFixed(2).replace('.', ',')} · ${mins}min</div></div><span class="badge badge-aberto">Aberto</span>`;
    lista.appendChild(card);
  });
  const proxNum = String(balcoes.length + 1).padStart(2, '0');
  const btn = document.createElement('button');
  btn.className = 'btn-outline-novo';
  btn.textContent = `+ Abrir balcão ${proxNum}`;
  btn.onclick = novoBalcão;
  lista.appendChild(btn);
}
// ── PEDI AQUI ──
function renderizarPedidoAqui(){
  const lista = document.getElementById('pedidoAquiList');
  if(!lista) return;
  if(pedidoAquiList.length === 0){
    lista.innerHTML = `<div class="balcao-empty">Nenhum pedido Pedi Aqui</div>`;
  } else {
    lista.innerHTML = '';
    pedidoAquiList.forEach(p => {
      const nomePagLocal = {pix:'Pix', cartao:'Cartão', dinheiro:'Dinheiro'}[p.pagamento] || (p.pagamento || 'Sem pagamento');
      const card = document.createElement('div');
      card.className = 'pedido-card aguardando';
      card.innerHTML = `
        <div class="pedido-header">
          <div class="pedido-nome">Pedido #${p.numero}</div>
          <span class="badge badge-aguardando">Aberto</span>
        </div>
        <div class="pedido-info">Taxa: ${fmt(p.taxa || 0)} · Total: ${fmt(p.total || 0)}<br>${nomePagLocal}</div>
        <button type="button" onclick="concluirPedidoAqui('${p.id}')"
          style="width:100%;margin-top:8px;padding:8px;background:linear-gradient(180deg,#2aa160,#1d7b49);border:1px solid #258754;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">
          ✓ Concluído
        </button>`;
      lista.appendChild(card);
    });
  }
  const btn = document.createElement('button');
  btn.className = 'btn-outline-novo';
  btn.textContent = '+ Novo pedido Pedi Aqui';
  btn.onclick = abrirPedidoAquiModal;
  lista.appendChild(btn);
}

window.abrirPedidoAquiModal = function(){
  document.getElementById('pa-numero').value = '';
  document.getElementById('pa-taxa').value = '';
  document.getElementById('pa-valor').value = '';
  window._paPagamento = null;
  ['dinheiro','cartao','pix'].forEach(t => {
    const el = document.getElementById('pa-btn-'+t);
    if(el){ el.style.borderColor = 'var(--border3)'; el.style.opacity = '0.55'; }
  });
  abrirModal('modal-pedidoaqui');
};

window.selecionarPagPA = function(p){
  window._paPagamento = p;
  const cores = {pix:'#c89a2a', cartao:'#5e96ff', dinheiro:'var(--verde)'};
  ['dinheiro','cartao','pix'].forEach(t => {
    const el = document.getElementById('pa-btn-'+t);
    if(!el) return;
    const ativo = t === p;
    el.style.borderColor = ativo ? cores[t] : 'var(--border3)';
    el.style.opacity = ativo ? '1' : '0.55';
  });
};

window.confirmarPedidoAqui = function(){
  const numero = document.getElementById('pa-numero').value.trim();
  const taxa = parseFloat(document.getElementById('pa-taxa').value) || 0;
  const total = parseFloat(document.getElementById('pa-valor').value) || 0;
  if(!numero){ mostrarAlerta('Informe o número do pedido', 'vermelho'); return; }
  if(total <= 0){ mostrarAlerta('Informe o valor total', 'vermelho'); return; }
  if(!window._paPagamento){ mostrarAlerta('Selecione a forma de pagamento', 'vermelho'); return; }
  const id = 'PA' + Date.now();
  const obj = {id, numero, taxa, total, pagamento: window._paPagamento, abertoEm: Date.now(), status:'aberto'};
  pedidoAquiList.push(obj);
  salvarPedidoAvulsoFirebase('pedidoaqui', obj);
  renderizarPedidoAqui();
  fecharModal('modal-pedidoaqui');
  mostrarAlerta(`Pedido Pedi Aqui #${numero} lançado`, 'verde');
};

window.concluirPedidoAqui = async function(id){
  const p = pedidoAquiList.find(x => x.id === id);
  if(!p) return;
  if(!confirm('Concluir pedido #' + p.numero + ' — ' + fmt(p.total) + '?')) return;
  const hojeData = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  const subtotal = p.total - (p.taxa || 0);
  const venda = {
    id: Date.now(), mesa: p.numero, canal:'pedidoaqui',
    cliente:'', telefone:'', endereco:'',
    hora: new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}),
    itens: [{nome:'Pedido PedirAqui #' + p.numero, preco: subtotal, qtd:1, obs:''}],
    subtotal, desconto:0, taxa: p.taxa || 0, total: p.total,
    pagamentos: [{tipo:p.pagamento, valor:p.total}],
    pagamento: p.pagamento
  };
  try{
    await set(ref(db, `caixa/${hojeData}/vendas/v${Date.now()}`), venda);
    const snap = await get(ref(db, `caixa/${hojeData}`));
    const atual = snap.val() || {};
    const upd = {data: hojeData};
    upd[p.pagamento] = (atual[p.pagamento] || 0) + p.total;
    if(p.taxa) upd.taxa = (atual.taxa || 0) + p.taxa;
    upd.canalPedirAqui = (atual.canalPedirAqui || 0) + 1;
    await update(ref(db, `caixa/${hojeData}`), upd);
    pedidoAquiList = pedidoAquiList.filter(x => x.id !== id);
    removerPedidoAvulsoFirebase('pedidoaqui', id);
    renderizarPedidoAqui();
    mostrarAlerta('Pedido #' + p.numero + ' concluído — ' + fmt(p.total), 'verde');
  }catch(e){
    mostrarAlerta('Erro ao concluir: ' + e.message, 'vermelho');
  }
};

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
    if(r.p.tamanhos){
      return `<div style="padding:7px 10px;border-bottom:1px solid #232a25;font-size:12px;"><div style="font-weight:600;margin-bottom:4px;">${r.p.nome}</div><div style="display:flex;gap:5px;"><button type="button" class="btn" style="font-size:11px;padding:5px 8px;" onclick="adicionarProdutoModalPedido(${i},'M')">M ${fmt(r.p.tamanhos.M)}</button><button type="button" class="btn" style="font-size:11px;padding:5px 8px;" onclick="adicionarProdutoModalPedido(${i},'G')">G ${fmt(r.p.tamanhos.G)}</button><button type="button" class="btn" style="font-size:11px;padding:5px 8px;" onclick="adicionarProdutoModalPedido(${i},'GG')">GG ${fmt(r.p.tamanhos.GG)}</button></div></div>`;
    }
    return `<div style="padding:8px 10px;border-bottom:1px solid #232a25;font-size:12px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="adicionarProdutoModalPedido(${i})"><span>${r.p.nome}</span><span style="color:var(--verde);font-weight:600;">${fmt(r.p.preco)}</span></div>`;
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
    lista.innerHTML = carrinho.map((it,idx)=>`<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:6px 0;border-bottom:1px solid #232a25;"><span>${it.nome}</span><div style="display:flex;align-items:center;gap:6px;"><button type="button" onclick="ajustarQtdModalPedido(${idx},-1)" style="background:#1f2521;border:1px solid #313a33;border-radius:6px;width:22px;height:22px;cursor:pointer;color:var(--txt);font-size:13px;">-</button><span style="min-width:14px;text-align:center;font-weight:600;">${it.qtd}</span><button type="button" onclick="ajustarQtdModalPedido(${idx},1)" style="background:#1f2521;border:1px solid #313a33;border-radius:6px;width:22px;height:22px;cursor:pointer;color:var(--txt);font-size:13px;">+</button><span style="color:var(--verde);font-weight:600;min-width:64px;text-align:right;">${fmt(it.preco*it.qtd)}</span><button type="button" onclick="removerProdutoModalPedido(${idx})" style="background:none;border:none;color:var(--txt2);cursor:pointer;font-size:16px;">×</button></div></div>`).join('');
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
  ['np-nome','np-telefone','np-endereco-novo','np-endereco-label','np-km','np-taxa','np-troco','np-obs','np-busca-produto'].forEach(id => {
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

let mmpTamanho = null, mmpSabor1 = null, mmpItemPendente = null;

window.abrirMeioAMeioPedido = function(){ mmpSabor1=null; mmpTamanho=null; abrirModal('modal-mmp-tamanho'); };
window.escolherTamMMP = function(tam){ mmpTamanho=tam; fecharModal('modal-mmp-tamanho'); filtrarMMP1('trad'); abrirModal('modal-mmp-sabor1'); };

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
    btn.onclick = ()=>onClickFn({nome:p.nome, metade});
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

window.buscarClienteModalPorNome = function(termo){
  const box = document.getElementById('np-nome-resultados');
  termo = (termo||'').trim().toLowerCase();
  if(termo.length < 2){ box.style.display='none'; box.innerHTML=''; return; }
  const db = carregarClientesDB();
  const resultados = Object.values(db).filter(c => (c.nome||'').toLowerCase().includes(termo));
  if(!resultados.length){ box.style.display='none'; box.innerHTML=''; return; }
  box.style.display = 'block';
  box.innerHTML = resultados.slice(0,8).map(c => `<div style="padding:8px 10px;border-bottom:1px solid #232a25;font-size:12px;cursor:pointer;display:flex;justify-content:space-between;" onclick="selecionarClienteBuscaNome('${c.telefone}')"><span>${c.nome}</span><span style="color:var(--txt2);">${c.telefone}</span></div>`).join('');
};

window.selecionarClienteBuscaNome = function(telefone){
  document.getElementById('np-telefone').value = telefone;
  document.getElementById('np-nome-resultados').style.display = 'none';
  document.getElementById('np-nome-resultados').innerHTML = '';
  aoDigitarTelefonePedido();
};

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

function renderPedidosAnterioresCliente(cli){
  const box = document.getElementById('np-pedidos-anteriores');
  const pedidos = (cli && cli.pedidos) || [];
  if(!pedidos.length){ box.style.display='none'; box.innerHTML=''; window._pedidosAnterioresTemp=[]; return; }
  window._pedidosAnterioresTemp = pedidos;
  box.style.display = 'block';
  box.innerHTML = `<div style="padding:7px 10px;font-size:11px;font-weight:700;color:var(--txt2);border-bottom:1px solid #232a25;">🔁 Pedidos anteriores</div>` + pedidos.slice(0,5).map((ped,idx)=>{
    const dataFmt = new Date(ped.data).toLocaleDateString('pt-BR');
    const itensTxt = ped.itens.map(it=>it.qtd+'x '+it.nome).join(', ');
    return `<div style="padding:8px 10px;border-bottom:1px solid #232a25;font-size:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;"><div style="flex:1;min-width:0;"><div style="color:var(--txt2);font-size:10px;">${dataFmt}</div><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${itensTxt}</div></div><button type="button" onclick="usarPedidoAnterior(${idx})" style="flex-shrink:0;padding:6px 10px;background:linear-gradient(180deg,#274f88,#1b3158);border:1px solid var(--azul);border-radius:8px;color:#aad4ff;font-size:11px;font-weight:700;cursor:pointer;">Pedir de novo</button></div>`;
  }).join('');
}

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
  sel.innerHTML = enderecos.map(e=>`<option value="${e.id}">📍 ${e.label} — ${e.endereco}</option>`).join('') + '<option value="__novo__">+ Novo endereço</option>';
  if(enderecos.length) sel.value = enderecos[0].id;
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

// 🔴 FUNÇÃO AGORA É async
window.confirmarNovoPedido = async function() {
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
    if (!window._carrinhoPedidoModal.length) { mostrarAlerta('Adicione pelo menos um produto', 'vermelho'); return; }
    
    salvarOuAtualizarCliente({ nome, telefone: tel, endereco:{ label:labelFinal, endereco:enderecoFinal, km, taxa } });
    
    const canal = _tipoNovoPedido;
    const id = (canal === 'delivery' ? 'D' : 'T') + Date.now();
    const itensPedido = window._carrinhoPedidoModal.map(it=>({
      nome: it.nome, preco: it.preco, qtd: it.qtd, obs:'', categoria:'', 
      setor:'cozinha', enviadoCozinha:false, criadoEm: Date.now()
    }));
    const totalItens = itensPedido.reduce((s,i)=>s+i.preco*i.qtd,0);
    salvarPedidoHistoricoCliente(tel, itensPedido, totalItens);
    
    const pedido = {
      id, tipo: canal, nome, telefone: tel, 
      endereco: enderecoFinal, enderecoLabel: labelFinal, km, taxa, 
      pagamento: pag, trocoPara: troco, observacao: obs, 
      abertoEm: Date.now(), total: totalItens, itens: itensPedido, status: 'aguardando'
    };
    
    if (canal === 'delivery') {
      deliveryList.push(pedido);
      salvarPedidoAvulsoFirebase('delivery', pedido);
      renderizarDelivery();
    } else {
      telefoneList.push(pedido);
      salvarPedidoAvulsoFirebase('telefone', pedido);
      renderizarTelefone();
    }
    
    const novaMesa = {
      id, status: 'ocupada', inicio: Date.now(), pedido: itensPedido, 
      virtual: true, canal, nomeCliente: nome, telefoneCliente: tel, 
      endereco: enderecoFinal, km, taxa, observacao: obs
    };
    mesas.push(novaMesa);
    await salvarMesaCx(novaMesa);
    
    fecharModal('modal-novo-pedido');
    
    // 🔴 NOVO: Abre a mesa e envia DIRETO pra cozinha
    mesaAtualCx = novaMesa;
    try {
      await window.enviarCozinhaCx();
      mostrarAlerta(`✓ Pedido de ${nome} criado e enviado pra cozinha — ${fmt(totalItens)}`, 'verde');
    } catch(eEnvio) {
      console.warn('Erro ao enviar pra cozinha:', eEnvio);
      mostrarAlerta(`Pedido criado, mas não foi enviado pra cozinha. Abra a mesa e envie manualmente.`, 'vermelho');
    }
    
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
    const badgeClasse = {aguardando: 'badge-aguardando', preparando: 'badge-preparando', emrota: 'badge-emrota', entregue: 'badge-verde', atrasado: 'badge-atrasado'}[p.status] || 'badge-aguardando';
    const statusTxt = {aguardando: 'Aguardando', preparando: 'Na cozinha', emrota: 'Em rota', entregue: 'Entregue', atrasado: 'Atrasado'}[p.status] || 'Aguardando';
    let info = `${p.endereco || ''} · R$ ${(p.total||0).toFixed(2).replace('.', ',')} · ${mins}min<br>`;
    info += { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' }[p.pagamento] || p.pagamento;
    if (p.pagamento === 'dinheiro' && p.trocoPara > 0) info += ` (troco p/ R$ ${p.trocoPara.toFixed(2).replace('.', ',')})`;
    const card = document.createElement('div');
    card.className = `pedido-card ${p.status}`;
    card.onclick = ()=>abrirMesaCx(p.id);
    card.innerHTML = `<div class="pedido-header"><div class="pedido-nome">${p.nome}</div><span class="badge ${badgeClasse}">${statusTxt}</span></div><div class="pedido-info">${info}</div><button type="button" onclick="concluirPedidoCard(event,'${p.id}','delivery')" style="width:100%;margin-top:8px;padding:8px;background:linear-gradient(180deg,#2aa160,#1d7b49);border:1px solid #258754;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">✓ Concluir (entregue)</button>`;
    lista.appendChild(card);
  });
  const btn = document.createElement('button');
  btn.className = 'btn-outline-novo';
  btn.textContent = '+ Novo pedido delivery';
  btn.onclick = ()=>abrirModalNovoPedido('delivery');
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
    const badgeClasse = {aguardando: 'badge-aguardando', preparando: 'badge-preparando', entregue: 'badge-verde', atrasado: 'badge-atrasado'}[p.status] || 'badge-aguardando';
    const statusTxt = {aguardando: 'Aguardando', preparando: 'Na cozinha', entregue: 'Entregue', atrasado: 'Atrasado'}[p.status] || 'Aguardando';
    let info = `${p.endereco || ''} · R$ ${(p.total||0).toFixed(2).replace('.', ',')} · ${mins}min<br>`;
    info += { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' }[p.pagamento] || p.pagamento;
    const card = document.createElement('div');
    card.className = `pedido-card ${p.status}`;
    card.onclick = ()=>abrirMesaCx(p.id);
    card.innerHTML = `<div class="pedido-header"><div class="pedido-nome">${p.nome}</div><span class="badge ${badgeClasse}">${statusTxt}</span></div><div class="pedido-info">${info}</div><button type="button" onclick="concluirPedidoCard(event,'${p.id}','telefone')" style="width:100%;margin-top:8px;padding:8px;background:linear-gradient(180deg,#2aa160,#1d7b49);border:1px solid #258754;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">✓ Concluir (entregue)</button>`;
    lista.appendChild(card);
  });
  const btn = document.createElement('button');
  btn.className = 'btn-outline-novo';
  btn.textContent = '+ Novo pedido telefone';
  btn.onclick = ()=>abrirModalNovoPedido('telefone');
  lista.appendChild(btn);
}

window.concluirPedidoCard = function(ev, id, canal){
  ev.stopPropagation();
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
  if(!confirm('Concluir pedido de '+nomeExibicao+' — '+fmt(total)+'?')) return;
  p.status = 'entregue';
  if(mesa){
    mesa.status = 'livre'; mesa.pedido = []; mesa.inicio = null;
    salvarMesaCx(mesa);
  }
  mesas = mesas.filter(m=>m.id!==id);
  removerPedidoAvulsoFirebase(canal, id);
  mostrarAlerta('Pedido de '+nomeExibicao+' concluído — '+fmt(total), 'verde');
  if(mesaAtualCx && mesaAtualCx.id===id){
    mesaAtualCx = null;
    voltarMesasCaixa();
  }
};

window.avancarStatusEntregaCx = function(novoStatus){
  if(!mesaAtualCx) return;
  const lista = mesaAtualCx.canal==='delivery' ? deliveryList : telefoneList;
  const p = lista.find(x=>x.id===mesaAtualCx.id);
  if(p){
    p.status = novoStatus;
    salvarPedidoAvulsoFirebase(mesaAtualCx.canal, p);
    if(mesaAtualCx.canal==='delivery') renderizarDelivery(); else renderizarTelefone();
  }
};

async function reconciliarMesasVirtuais(){
  const todas = [...balcoes.map(b=>({...b, canal:'balcao'})),...deliveryList.map(p=>({...p, canal:'delivery'})),...telefoneList.map(p=>({...p, canal:'telefone'}))];
  for(const item of todas){
    if(mesas.find(m=>m.id===item.id)) continue;
    let pedidoSalvo=[];
    try{
      const snap = await get(ref(db,'mesas/mesa'+item.id));
      const dados = snap.val();
      if(dados && dados.pedido) pedidoSalvo = Object.values(dados.pedido);
    }catch(e){}
    mesas.push({id:item.id, status:'ocupada', inicio:item.abertoEm||Date.now(), pedido:pedidoSalvo, virtual:true, canal:item.canal, numero:item.numero||'', nomeCliente:item.nome||item.nomePersonalizado||'', telefoneCliente:item.telefone||'', endereco:item.endereco||'', km:item.km||0, taxa:item.taxa||0, observacao:item.observacao||''});
  }
  const idsAtivos = new Set(todas.map(i=>i.id));
  mesas = mesas.filter(m => !m.virtual || idsAtivos.has(m.id));
  renderMesasCaixa();
}

function inicializarNovoLayout() {
  renderizarBalcoes();
  renderizarDelivery();
  renderizarTelefone();
  renderizarPedidoAqui();          // 🔴 adicionar
  reconciliarMesasVirtuais();
  setInterval(() => {
    renderizarBalcoes();
    renderizarDelivery();
    renderizarTelefone();
    renderizarPedidoAqui();        // 🔴 adicionar
  }, 60000);
}

document.getElementById('screen-main').classList.add('active');
document.getElementById('screen-main').style.display = 'flex';

['screen-pedido'].forEach(id=>{
  const el = document.getElementById(id);
  if(el){ el.classList.remove('active'); el.style.display='none'; }
});

setTimeout(()=>{
  renderMesasCaixa();
}, 500);

setTimeout(inicializarNovoLayout, 1000);
