
// live-widgets.js — RESET (robust): rebuild TradingView widget on each symbol change
(function(){
  const $  = (s)=>document.querySelector(s);
  const $$ = (s)=>Array.from(document.querySelectorAll(s));

  // --- Watchlists ---
  const WATCH = {
    all:    ["BTC","ETH","SOL","ADA","XRP","DOGE","AVAX","LINK","MATIC","BNB","DOT","LTC","OP","TON","NEAR","ATOM","SUI","SEI","APE","AR","FET","PEPE","SHIB","CRV","COMP","RUNE","GMX","MKR","UNI","AAVE","SNX","CAKE"],
    defi:   ["UNI","AAVE","MKR","CRV","SNX","COMP","CAKE","INJ","RUNE","GMX"],
    layer1: ["BTC","ETH","SOL","ADA","XRP","AVAX","NEAR","ATOM","SUI","SEI","DOT","BNB","TRX","OP","ARB","TON"],
    meme:   ["DOGE","SHIB","PEPE","BONK","WIF","FLOKI","BRETT","MEW"],
    ai:     ["FET","RNDR","AGIX","TAO","GRT","INJ"],
    fx:     ["EURUSDT","GBPUSDT","USDJPY"]
  };
  let CAT='all', MODE='risers', PERIOD='24h';

  function mapToBinance(sym){
    if (/USDT$/.test(sym)) return sym;
    const exceptions = {
      'IOTA':'IOTAUSDT','MIOTA':'IOTAUSDT','BCH':'BCHUSDT','XRP':'XRPUSDT','XMR':'XMRUSDT',
      'MATIC':'MATICUSDT','ARB':'ARBUSDT','OP':'OPUSDT','WIF':'WIFUSDT','PEPE':'PEPEUSDT',
      'BONK':'BONKUSDT','BRETT':'BRETTUSDT','TAO':'TAOUSDT','RNDR':'RNDRUSDT','CRV':'CRVUSDT',
      'COMP':'COMPUSDT','RUNE':'RUNEUSDT','GMX':'GMXUSDT','MKR':'MKRUSDT','UNI':'UNIUSDT','AAVE':'AAVEUSDT','SNX':'SNXUSDT','CAKE':'CAKEUSDT'
    };
    return exceptions[sym] || (sym + 'USDT');
  }
  function tvSymbol(sym){ return 'BINANCE:' + mapToBinance(sym); }

// === Timeframe-aware price change helpers ===
const INTERVAL = { "5m":"5m", "15m":"15m", "1h":"1h" };

async function fetch24hChange(sym, {signal} = {}){
  const symbol = mapToBinance(sym);
  const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`, {signal});
  if (!r.ok) throw new Error(r.statusText);
  const j = await r.json();
  return { price: +j.lastPrice, chg: +j.priceChangePercent };
}

async function fetchKlineChange(sym, tf, {signal} = {}){
  const symbol = mapToBinance(sym);
  const interval = INTERVAL[tf];
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=2`;
  const r = await fetch(url, {signal});
  if (!r.ok) throw new Error(r.statusText);
  const arr = await r.json();
  const prevClose = parseFloat(arr[0][4]);
  const lastClose = parseFloat(arr[1][4]);
  const chg = ((lastClose - prevClose) / prevClose) * 100;
  return { price: lastClose, chg };
}

async function fetchChangeByPeriod(sym, period, opts = {}){
  if (period === "24h") return fetch24hChange(sym, opts);
  if (period in INTERVAL) return fetchKlineChange(sym, period, opts);
  return fetch24hChange(sym, opts);
}


  // ===== TradingView: always rebuild widget when changing symbol =====
  function mountTV(tvSym){
    const box = $("#chartBox");
    if (!box) return;
    // Clear and recreate container every time
    box.innerHTML = '<div id="tvChart" style="width:100%;height:520px;"></div>';
    if (!window.TradingView || !window.TradingView.widget){
      // tv.js not ready yet; try again shortly
      setTimeout(()=> mountTV(tvSym), 250);
      return;
    }
    const widget = new TradingView.widget({
      container_id: 'tvChart',
      symbol: tvSym || 'BINANCE:BTCUSDT',
      interval: '60',
      theme: "dark",
      style: "1",
      timezone: "Etc/UTC",
      allow_symbol_change: false,
      autosize: true,
    });
    
    setTimeout(syncHeightsExact, 250);
// No need to cache; we rebuild per selection to avoid stuck symbols
  }

  // Expose selector function (UI unchanged)
  window.selectSymbol = function(sym){
    try{ window.dispatchEvent(new CustomEvent('dxlt:symbol',{detail:{sym:(sym||'BTC').toUpperCase()}})); }catch(e){}

    const s = (sym||'BTC').toUpperCase();
    const title = $("#chartTitle"); if (title) title.textContent = "Chart — " + s;
    mountTV(tvSymbol(s));
  };

  // ===== Risers/Sinkers =====
  async function fetchTicker(sym){
    try{
      const symbol = mapToBinance(sym);
      const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`);
      if (!r.ok) throw new Error(r.statusText);
      const j = await r.json();
      const price = parseFloat(j.lastPrice);
      const chg = parseFloat(j.priceChangePercent);
      return { sym, price, chg };
    }catch(e){
      return { sym, price: NaN, chg: NaN, err:true };
    }
  }
  function fmt(p){
    if (!isFinite(p)) return '—';
    if (p>=1000) return p.toLocaleString(undefined,{maximumFractionDigits:0});
    if (p>=1) return p.toLocaleString(undefined,{maximumFractionDigits:2});
    return p.toLocaleString(undefined,{maximumFractionDigits:6});
  }
  let _tableCtrl = null;
async function renderTable(){
  const tbody = document.querySelector("#coinsTable tbody");
  if (!tbody) return;

  // Abort any in-flight render to avoid flicker
  if (_tableCtrl) { try{ _tableCtrl.abort(); }catch(e){} }
  _tableCtrl = new AbortController();
  const signal = _tableCtrl.signal;

  const snapshot = { cat: CAT, mode: MODE, period: PERIOD };

  const list = (WATCH[CAT] || WATCH.all).slice(0, 60);
  // Fetch all changes in parallel for the chosen timeframe
  const data = await Promise.all(list.map(async (sym)=>{
    try{
      const r = await fetchChangeByPeriod(sym, PERIOD, {signal});
      return { sym, price: r.price, chg: r.chg };
    }catch(e){ return { sym, price: NaN, chg: NaN, err:true }; }
  }));

  // If state changed while we were fetching, bail (prevents stale paints)
  if (snapshot.cat !== CAT || snapshot.mode !== MODE || snapshot.period !== PERIOD) return;

  const sorted = data.filter(x=>Number.isFinite(x.chg))
    .sort((a,b)=> MODE==='risers' ? b.chg - a.chg : a.chg - b.chg)
    .slice(0, 15);

  function fmt(p){
    if (!Number.isFinite(p)) return '—';
    if (p>=1000) return p.toLocaleString(undefined,{maximumFractionDigits:0});
    if (p>=1) return p.toLocaleString(undefined,{maximumFractionDigits:2});
    return p.toLocaleString(undefined,{maximumFractionDigits:6});
  }

  tbody.innerHTML = sorted.map((x,i)=>`
    <tr data-sym="${x.sym}">
      <td>${i+1}</td>
      <td>${x.sym}</td>
      <td>${fmt(x.price)}</td>
      <td class="${x.chg>=0?'up':'down'}">${(x.chg>=0?'+':'')+x.chg.toFixed(2)}%</td>
    </tr>
  `).join("");

  // Keep heights exact without changing layout
  if (typeof syncHeightsExact === "function") syncHeightsExact();
}

  // ===== Wire up UI (unchanged visually) =====
  function hookUI(){
    // Category pills -> filter table AND clicking row -> update chart
    document.querySelector(".cat-bar")?.addEventListener("click",(e)=>{
      const b=e.target.closest("[data-cat]"); if(!b) return;
      CAT = b.dataset.cat;
      renderTable();
  try{
    if(window.tvWidget && window.tvWidget.chart){
      let res = PERIOD;
      if(res==='24h') res='1D';
      if(res==='1w') res='1W';
      if(res==='1h') res='60';
      if(res==='15m') res='15';
      if(res==='5m') res='5';
      if(res==='1m') res='1';
      window.tvWidget.chart().setResolution(res,()=>{});
    }
  }catch(e){}

    });
    $("#modeSeg")?.addEventListener("click",(e)=>{
      const b=e.target.closest("[data-mode]"); if(!b) return;
      $$("#modeSeg .seg").forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); MODE=b.dataset.mode; renderTable();
  try{
    if(window.tvWidget && window.tvWidget.chart){
      let res = PERIOD;
      if(res==='24h') res='1D';
      if(res==='1w') res='1W';
      if(res==='1h') res='60';
      if(res==='15m') res='15';
      if(res==='5m') res='5';
      if(res==='1m') res='1';
      window.tvWidget.chart().setResolution(res,()=>{});
    }
  }catch(e){}

    });
    $("#timeSeg")?.addEventListener("click",(e)=>{
      const b=e.target.closest("[data-t]"); if(!b) return;
      $$("#timeSeg .seg").forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); PERIOD = b.dataset.t;
  try{ window.dispatchEvent(new CustomEvent('dxlt:period',{detail:{period:PERIOD}})); }catch(e){}
  renderTable();
  try{
    if(window.tvWidget && window.tvWidget.chart){
      let res = PERIOD;
      if(res==='24h') res='1D';
      if(res==='1w') res='1W';
      if(res==='1h') res='60';
      if(res==='15m') res='15';
      if(res==='5m') res='5';
      if(res==='1m') res='1';
      window.tvWidget.chart().setResolution(res,()=>{});
    }
  }catch(e){}

    });
    $("#coinsTable")?.addEventListener("click",(e)=>{
      const tr=e.target.closest("tr[data-sym]"); if(!tr) return;
      selectSymbol(tr.dataset.sym);
    });
  }

  window.addEventListener('load', ()=>{
    hookUI();
    // First paint
    setTimeout(()=> selectSymbol('BTC'), 300);
    renderTable();
  try{
    if(window.tvWidget && window.tvWidget.chart){
      let res = PERIOD;
      if(res==='24h') res='1D';
      if(res==='1w') res='1W';
      if(res==='1h') res='60';
      if(res==='15m') res='15';
      if(res==='5m') res='5';
      if(res==='1m') res='1';
      window.tvWidget.chart().setResolution(res,()=>{});
    }
  }catch(e){}

    // Auto-refresh risers
    setInterval(()=> renderTable(), 25000);
  });
})();

function syncHeightsExact(){
  const chartCard = document.querySelector('.chart-card');
  const sideCard  = document.querySelector('.side-card');
  if (!chartCard || !sideCard) return;
  chartCard.style.height='auto'; sideCard.style.height='auto';
  const h = Math.max(chartCard.offsetHeight, sideCard.offsetHeight);
  chartCard.style.height = h+'px'; sideCard.style.height = h+'px';
  const head = chartCard.querySelector('.card-head'); const box = chartCard.querySelector('.chart-box');
  const headH = head ? head.offsetHeight : 0;
  if (box){ const innerH = Math.max(320, h - headH); box.style.height = innerH+'px';
    const tv = document.getElementById('tvChart'); if (tv) tv.style.height = innerH+'px'; }
}
window.addEventListener('resize', ()=> setTimeout(syncHeightsExact, 50));


// --- Binance WS Ticker for Risers (fast) ---
let wsRisers=null;
function startRisersWS(symbols){
  try{ if(wsRisers){wsRisers.close();} }catch(e){}
  const streams = symbols.map(s=>s.toLowerCase()+"@ticker").join('/');
  wsRisers = new WebSocket("wss://stream.binance.com:9443/stream?streams="+streams);
  wsRisers.onmessage = function(ev){
    try{
      const msg=JSON.parse(ev.data);
      const d=msg.data;
      const sym=(d.s||"").toUpperCase();
      const pc=parseFloat(d.P||0);
      // Update riser row if present
      const el=document.querySelector('.riser[data-sym="'+sym+'"] .change');
      if(el){ el.textContent=pc.toFixed(2)+"%"; }
    }catch(e){}
  };
  wsRisers.onclose=function(){ setTimeout(()=>startRisersWS(symbols),5000); };
}
// Hook into existing init after table render
window.addEventListener("load",()=>{
  try{
    // find symbols in initial risers list (if any)
    const syms=[...document.querySelectorAll('.riser')].map(x=>x.dataset.sym||'BTC');
    if(syms.length) startRisersWS(syms);
  }catch(e){}
});
