
// ===== Pulse Widget (ECG-like monitor reacting to market state) =====

(function(){
  const canvas = document.getElementById('pulseCanvas');
  const ctx = canvas.getContext('2d');
  let W,H, dpr;
  function resize(){
    dpr = Math.max(1, window.devicePixelRatio || 1);
    W = canvas.clientWidth * dpr;
    H = canvas.clientHeight * dpr;
    canvas.width = W; canvas.height = H;
  }
  resize(); window.addEventListener('resize', resize);

  // State
  let symbol = localStorage.getItem('PULSE_SYMBOL') || localStorage.getItem('CURRENT') || 'BTCUSDT';
  const symEl = document.getElementById('pulseSymbol');
  const bpmEl = document.getElementById('pulseBpm');
  const stateEl = document.getElementById('pulseState');
  const input = document.getElementById('pulseSearch');
  const setBtn = document.getElementById('pulseSet');
  if (symEl) symEl.textContent = symbol;
  if (input) input.value = symbol;

  // Wallet open (using existing modal id if present)
  const walletOpen = document.getElementById('wallet-open');
  if(walletOpen){
    walletOpen.addEventListener('click', ()=>{
      const m = document.getElementById('wallet-modal');
      if(m) m.style.display = 'flex';
    });
    const close = document.getElementById('wallet-close');
    if(close){
      close.addEventListener('click', ()=>{
        const m = document.getElementById('wallet-modal');
        if(m) m.style.display = 'none';
      });
    }
  }

  
  /* === Audio === */
  let audioCtx = null, gain = null, tickTimer = null, soundOn = false;
  const soundBtn = document.getElementById('soundBtn');
  function ensureAudio(){
    if(audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    audioCtx = new AC();
    gain = audioCtx.createGain();
    gain.gain.value = 0.0;
    gain.connect(audioCtx.destination);
  }
  function playTick(){
    const heroEl = document.querySelector('.pulse-hero'); if(heroEl){ heroEl.classList.add('beat'); setTimeout(()=> heroEl.classList.remove('beat'), 120); }
    const bpmChip = document.getElementById('pulseBpm'); if(bpmChip){ const p = bpmChip.closest('.chip'); p && (p.classList.add('pulse'), setTimeout(()=> p.classList.remove('pulse'), 160)); }
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = flatline ? 240 : 760;
    g.gain.value = 0.0;
    osc.connect(g); g.connect(gain);
    const t = audioCtx.currentTime;
    g.gain.linearRampToValueAtTime(flatline ? 0.15 : 0.12, t + 0.01);
    g.gain.linearRampToValueAtTime(0.0, t + 0.08);
    osc.start(t);
    osc.stop(t + 0.1);
  }
  function scheduleTicks(){
    if(tickTimer) clearInterval(tickTimer);
    if(!soundOn) return;
    // period in ms
    const period = Math.max(0.25, 60 / (bpm||60)) * 1000;
    tickTimer = setInterval(()=>{ playTick(); }, period);
  }
  if(soundBtn){ soundBtn.classList.add('off'); soundBtn.addEventListener('click', ()=>{ soundOn = !soundOn; soundBtn.classList.toggle('on', soundOn); soundBtn.classList.toggle('off', !soundOn); ensureAudio(); if(soundOn && audioCtx && audioCtx.state==='suspended') audioCtx.resume(); if(soundOn) playTick(); scheduleTicks(); }); }

  // ECG params
  let bpm = 75; // beats per minute baseline
  let flatline = false;
  let flatStart = null;
  let amp = 1.0; // amplitude multiplier
  let color = getComputedStyle(document.documentElement).getPropertyValue('--ecg-green').trim() || '#22d3ee';

  // Map ticker deltas to bpm/amp
  function updateFromMarket(deltaPct, volJump){
    const now = Date.now();
    // deltaPct: short-term % change (negative -> crashy)
    // volJump: scaled recent volatility
    // BPM between 50 (calm) and 140 (hype); amp between .4 and 1.8
    const clamp = (v,a,b)=> Math.max(a, Math.min(b,v));
    const mood = clamp(deltaPct, -5, 5); // -5% .. 5%
    bpm = clamp(90 + mood*6 + (volJump||0)*4, 50, 150);
    amp = clamp(1.0 + (mood/5)*0.6 + (volJump||0)*0.5, 0.4, 1.8);
    if (deltaPct < -2.5) color = getCSS('--ecg-red'); // crash -> red
    else if (Math.abs(deltaPct) < 0.5) color = getCSS('--ecg-yellow'); // flat
    else color = getCSS('--ecg-green');

    // flatline detector: bpm<55 and delta<-3% sustained 10s
    const cond = (bpm < 55) && (deltaPct < -3);
    if(cond){ flatStart = flatStart || now; if(now - flatStart > 10000){ if(!flatline){ flatline = true; flatEl && flatEl.classList.add('show'); try{navigator.vibrate && navigator.vibrate([80,120,80]);}catch(e){} } } }
    else { flatStart = null; if(flatline){ flatline = false; flatEl && flatEl.classList.remove('show'); } }
    scheduleTicks();

    bpmEl && (bpmEl.textContent = Math.round(bpm));
    stateEl && (stateEl.textContent = deltaPct.toFixed(2)+'%');
  }
  function getCSS(varname){
    const v = getComputedStyle(document.documentElement).getPropertyValue(varname);
    return v && v.trim() ? v.trim() : '#22d3ee';
  }


  // Overlay element for flatline
  const hero = document.querySelector('.pulse-hero');
  let flatEl = document.createElement('div');
  flatEl.className = 'flatline';
  hero && hero.appendChild(flatEl);

  // Binance WebSocket for live market
  let ws;
  function connectWS(sym){
    try { ws && ws.close(); } catch(e) {}
    const s = sym.toLowerCase();
    const url = `wss://stream.binance.com:9443/ws/${s}@trade`;
    ws = new WebSocket(url);
    let lastPrice = null;
    let lastUpdate = Date.now();
    let volAcc = 0;
    ws.onmessage = (ev)=>{
      const o = JSON.parse(ev.data);
      const price = parseFloat(o.p);
      const time = o.E || Date.now();
      if(lastPrice!=null){
        const dpct = ((price - lastPrice)/lastPrice)*100; // tiny per trade
        volAcc = (volAcc*0.9) + (Math.abs(dpct)*0.1);
        const seconds = (time - lastUpdate)/1000;
        if(seconds>1){ // update mood once per second
          const scaled = Math.sign(dpct)*Math.min(Math.abs(dpct)*250, 5); // scale per-second move to ~% range
          updateFromMarket(scaled, Math.min(volAcc*60, 3));
          lastUpdate = time;
        }
      }
      lastPrice = price;
    };
    ws.onopen = ()=> console.log('Pulse WS open', sym);
    ws.onclose = ()=> console.log('Pulse WS closed', sym);
    ws.onerror = ()=> console.warn('Pulse WS error');
  }
  connectWS(symbol);

  // Search/set symbol
  function setSymbol(sym){
    const was = symbol;
    if(!sym) return;
    symbol = sym.toUpperCase();
    applyMock(symbol);
    spark.price = []; spark.vol = []; spark.trend = []; state.lastSecPrice = null; state.lastTradeTs = 0;
    localStorage.setItem('PULSE_SYMBOL', symbol);
    symEl && (symEl.textContent = symbol);
    input && (input.value = symbol);
    connectWS(symbol);
  }
  setBtn && setBtn.addEventListener('click', ()=> setSymbol(input.value.trim()));
  input && input.addEventListener('keydown', (e)=>{
    if(e.key==='Enter') setSymbol(input.value.trim());
  });

  // ECG drawing
  let t = 0;
  function draw(){
    ctx.clearRect(0,0,W,H);
    // grid faint
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1;
    const grid = 20 * (dpr);
    for(let x=0;x<W;x+=grid){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y=0;y<H;y+=grid){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.restore();

    // line
    const baseline = H*0.55;
    const beatsPerSec = bpm/60;
    const period = 1 / beatsPerSec; // seconds per beat

    // time step
    const now = performance.now()/1000;
    const dt = now - t; t = now;

    // scroll speed tuned to bpm
    const speed = (W / 2) * (beatsPerSec/1.2); // px per sec
    offsetX = (offsetX + speed*dt) % W;

    // path
    ctx.lineWidth = 2*dpr;
    const grad = ctx.createLinearGradient(0,0,W,0);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color);
    ctx.strokeStyle = grad;
    ctx.beginPath();

    // draw ECG-like waveform across width, translating with offsetX
    const step = 2*dpr;
    for(let x=0;x<=W;x+=step){
      const u = ((x + offsetX)/W)*period; // normalized time along beats
      const phase = (u % period);
      const y = baseline - ecgShape(phase, period, flatline ? Math.min(amp,0.25) : amp) * (H*0.18);
      if(x===0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    requestAnimationFrame(draw);
  }
  let offsetX = 0;

  // ECG shape: simple PQRST composite
  function ecgShape(tsec, period, A){
    // tsec: seconds into beat
    const n = tsec / period; // 0..1
    const p = n;

    // P wave
    const Pw = gauss(p, 0.15, 0.015) * 0.6;
    // Q dip
    const Qw = -gauss(p, 0.24, 0.006) * 1.2;
    // R spike
    const Rw = gauss(p, 0.25, 0.004) * 3.8;
    // S dip
    const Sw = -gauss(p, 0.28, 0.008) * 1.6;
    // T wave
    const Tw = gauss(p, 0.45, 0.03) * 1.0;

    return A * (Pw + Qw + Rw + Sw + Tw);
  }
  function gauss(x, mu, sigma){
    return Math.exp(-((x-mu)*(x-mu))/(2*sigma*sigma));
  }

  draw();
})();


  // ===== Info Panel Wiring =====
  const pd = {
    sym: document.getElementById('pdSymbol'),
    sub: document.getElementById('pdSubtitle'),
    trend: document.getElementById('pdTrend'),
    regime: document.getElementById('pdRegime'),
    risk: document.getElementById('pdRisk'),
    about: document.getElementById('pdAbout'),
    age: document.getElementById('pdAge'),
    venue: document.getElementById('pdVenue'),
    lastBull: document.getElementById('pdLastBull'),
    nextRun: document.getElementById('pdNextRun'),
    genTrend: document.getElementById('pdGeneralTrend'),
    momentum: document.getElementById('pdMomentum'),
    vol: document.getElementById('pdVol'),
    spPrice: document.getElementById('sparkPrice'),
    spVol: document.getElementById('sparkVol'),
    spTrend: document.getElementById('sparkTrend'),
  };

  const spark = {
    price: [], vol: [], trend: [], maxN: 300
  };
  function pushSpark(arr, v){
    arr.push(v); if(arr.length > spark.maxN) arr.shift();
  }

  function drawSpark(canvas, data, color){
    if(!canvas) return;
    const r = Math.max(1, devicePixelRatio||1);
    const w = canvas.clientWidth*r, h= canvas.clientHeight*r;
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d');
    c.clearRect(0,0,w,h);
    if(!data.length) return;
    const min = Math.min(...data), max = Math.max(...data);
    const scale = (v)=>{
      if(max===min) return h/2;
      return h - ((v-min)/(max-min))*h;
    };
    c.lineWidth = 2*r;
    c.strokeStyle = color||'#22d3ee';
    c.beginPath();
    const step = w / (data.length-1||1);
    data.forEach((v,i)=>{
      const x = i*step; const y = scale(v);
      if(i===0) c.moveTo(x,y); else c.lineTo(x,y);
    });
    c.stroke();
  }

  function updateInfoPanel(sym, deltaPct, volJump){
    if(pd.sym) pd.sym.textContent = sym;
    if(pd.sub) pd.sub.textContent = 'Live insights updatingâ€¦';

    // simple regime guess using delta & vol
    const regime = (Math.abs(deltaPct)<0.6 ? 'Range' : (deltaPct>0 ? 'Bull' : 'Bear'));
    const risk = volJump>1.5 ? 'High' : (volJump>0.8 ? 'Medium' : 'Low');
    const genTrend = deltaPct>0.4 ? 'Up' : (deltaPct<-0.4 ? 'Down' : 'Side');

    pd.trend && (pd.trend.textContent = 'Trend: ' + genTrend);
    bumpChip(pd.trend);
    pd.trend && pd.trend.classList.remove('good','warn','bad'); pd.trend && pd.trend.classList.add(genTrend==='Up'?'good':(genTrend==='Down'?'bad':'warn'));
    pd.regime && (pd.regime.textContent = 'Regime: ' + regime);
    bumpChip(pd.regime);
    pd.risk && (pd.risk.textContent = 'Risk: ' + risk);
    bumpChip(pd.risk);
    pd.risk && pd.risk.classList.remove('good','warn','bad'); pd.risk && pd.risk.classList.add(risk==='Low'?'good':(risk==='High'?'bad':'warn'));

    // placeholders for later backend feed
    pd.about && (pd.about.textContent = 'â€” (coming soon)');
    pd.age && (pd.age.textContent = 'â€”');
    pd.venue && (pd.venue.textContent = 'Binance');
    pd.lastBull && (pd.lastBull.textContent = 'â€”');
    pd.nextRun && (pd.nextRun.textContent = 'â€”');
    pd.genTrend && (pd.genTrend.textContent = genTrend);
    pd.momentum && (pd.momentum.textContent = deltaPct.toFixed(2)+'%/s');
    pd.vol && (pd.vol.textContent = (volJump||0).toFixed(2));

    // Sparklines
    pushSpark(spark.price, state.lastPrice || 0);
    pushSpark(spark.vol, volJump || 0);
    // simple slope estimate over recent window
    const n = spark.price.length;
    if(n>5){
      const first = spark.price[Math.max(0, n-60)] || spark.price[0];
      const last = spark.price[n-1];
      pushSpark(spark.trend, last - first);
    }
    drawSparkLive(pd.spPrice, spark.price, '#22d3ee', 'price');
    drawSparkLive(pd.spVol, spark.vol, '#eab308', 'vol');
    drawSparkLive(pd.spTrend, spark.trend, '#60a5fa', 'trend');
  }

  // Integrate with existing WS updates:
  const state = { lastPrice: null, lastUpdate: 0, secSum: 0, secCount: 0, lastSecPrice: null, lastTradeTs: 0 };
  // Patch ws.onmessage to also update info panel and sparks
  const _connectWS = connectWS;
  connectWS = function(sym){
    _connectWS(sym);
    // we also need to intercept the ws created inside _connectWS; easiest: rebind events after slight delay
    setTimeout(()=>{
      try{
        if(ws){
          const old = ws.onmessage;
          ws.onmessage = (ev)=>{
            old && old(ev);
            try{
              const o = JSON.parse(ev.data);
              const price = parseFloat(o.p);
              state.lastPrice = price;
              const pe = document.getElementById('pdPrice'); if(pe) pe.textContent = '$' + Number(price).toLocaleString();
              state.secSum += price; state.secCount++;
              state.lastTradeTs = Date.now();
              // mimic delta/vol used in updateFromMarket
              // Note: we cannot read private volAcc; approximate using price diff
              // Here we just call updateInfoPanel with current 'stateEl' perc if available
            }catch(e){}
          }
        }
      }catch(e){}
    }, 200);
  };

  // Call updateInfoPanel periodically using current BPM/state values derived earlier
  setInterval(()=>{
    const sym = symbol;
    const statePctEl = stateEl && stateEl.textContent ? parseFloat(stateEl.textContent) : 0;
    const volApprox = Math.abs(statePctEl)/3;
    updateInfoPanel(sym, isNaN(statePctEl)?0:statePctEl, volApprox);
  }, 1000);


  // ===== Top 20 assets (CoinGecko) =====
  async function loadTopAssets(){
    const grid = document.getElementById('assetGrid');
    if(!grid) return;
    grid.innerHTML = '<div class="muted" style="padding:8px">Loading top assetsâ€¦</div>';
    try{
      const url = '/api/cg/top?vs=usd&limit=20';
      const res = await fetch(url, {cache:'no-store'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      grid.innerHTML='';
      data.forEach((a,i)=>{
        // map to Binance USDT symbol
        const overrides = { 'WBTC':'BTC', 'WETH':'ETH', 'BCH':'BCH', 'TON':'TON', 'XRP':'XRP', 'DOGE':'DOGE', 'ADA':'ADA', 'SOL':'SOL', 'TRX':'TRX', 'AVAX':'AVAX', 'BSC':'BNB', 'BNB':'BNB', 'USDC':'USDC', 'USDT':'USDT' };
        let base = (overrides[a.symbol.toUpperCase()] || a.symbol).toUpperCase();
        if(base in {'USDT':1,'USDC':1}) base = 'BTC'; // avoid stablecoins as pulse symbol default
        const binanceSym = base + 'USDT';

        const card = document.createElement('div');
        card.className = 'asset-card';
        card.setAttribute('data-symbol', binanceSym);
        card.innerHTML = `
          <div class="asset-rank">${i+1}</div>
          <img class="asset-logo" src="${a.image}" alt="${a.symbol}"/>
          <div class="asset-meta">
            <div class="asset-name">${a.name} <span class="muted">(${a.symbol.toUpperCase()})</span></div>
            <div class="asset-price">$${(a.current_price||0).toLocaleString()}</div>
          </div>
          <div class="asset-chg ${a.price_change_percentage_24h>=0?'pos':'neg'}">${(a.price_change_percentage_24h||0).toFixed(2)}%</div>
          <div class="asset-add">Set Pulse â†’</div>
        `;
        card.addEventListener('click', ()=>{
          try{ setSymbol && setSymbol(binanceSym); }catch(e){}
          // scroll to top
          window.scrollTo({top:0,behavior:'smooth'});
        });
        grid.appendChild(card);
      try{ const sdata = a.sparkline_in_7d && a.sparkline_in_7d.price || []; drawTileSpark(card.querySelector('.tile-spark'), sdata, '#22d3ee', '#ef4444'); }catch(e){}
      });
    }catch(e){
      grid.innerHTML = '<div class="muted" style="padding:8px">Unable to load top assets right now.</div>';
    }
  }
  window.addEventListener('DOMContentLoaded', loadTopAssets);


// ===== Mock Insights (deterministic per symbol) =====
function hashSym(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31 + s.charCodeAt(i))>>>0; return h; }
function rng(seed){ let t = seed>>>0; return ()=> (t = (1103515245*t + 12345)>>>0) / 0xFFFFFFFF; }

function mockInsights(sym){
  const seed = hashSym(sym);
  const R = rng(seed);
  const years = Math.floor(1 + R()*9); // 1..10y
  const exch = ['Binance','Coinbase','Kraken','Bybit','OKX'][Math.floor(R()*5)];
  const lastBullMonths = Math.floor(6 + R()*28); // months ago
  const nextRunMonths = Math.floor(2 + R()*16);
  const gt = ['Up','Down','Side'][Math.floor(R()*3)];
  const mom = (R()*8 - 4).toFixed(2) + '%/s';
  const vol = (0.4 + R()*2.2).toFixed(2);
  const about = ['Layer-1 smart contract chain','DeFi-focused ecosystem','Meme-powered community coin','AI + data infra token','High-throughput exchange chain'][Math.floor(R()*5)];
  return {
    about: about,
    age: years + 'y',
    venue: exch,
    lastBull: lastBullMonths + 'm ago',
    nextRun: 'â‰ˆ ' + nextRunMonths + 'm',
    general: gt,
    momentum: mom,
    volatility: vol
  };
}

function applyMock(sym){
  const m = mockInsights(sym);
  pd.about && (pd.about.textContent = m.about);
  pd.age && (pd.age.textContent = m.age);
  pd.venue && (pd.venue.textContent = m.venue);
  pd.lastBull && (pd.lastBull.textContent = m.lastBull);
  pd.nextRun && (pd.nextRun.textContent = m.nextRun);
  pd.genTrend && (pd.genTrend.textContent = m.general);
  pd.momentum && (pd.momentum.textContent = m.momentum);
  pd.vol && (pd.vol.textContent = m.volatility);
  pd.sub && (pd.sub.textContent = 'Live & mocked insights shown â€” backend ready.');
}

// enhance spark draw with neon fill
function drawSpark(canvas, data, color){
  if(!canvas) return;
  const r = Math.max(1, devicePixelRatio||1);
  const w = canvas.clientWidth*r, h= canvas.clientHeight*r;
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d');
  c.clearRect(0,0,w,h);
  if(!data.length) return;
  const min = Math.min(...data), max = Math.max(...data);
  const scale = (v)=>{
    if(max===min) return h/2;
    return h - ((v-min)/(max-min))*h;
  };
  const step = w / (data.length-1||1);
  c.lineWidth = 2*r;
  const grad = c.createLinearGradient(0,0,0,h);
  grad.addColorStop(0, color||'#22d3ee');
  grad.addColorStop(1, 'rgba(34,211,238,0.05)');
  // stroke
  c.strokeStyle = color||'#22d3ee';
  c.beginPath();
  data.forEach((v,i)=>{
    const x = i*step; const y = scale(v);
    if(i===0) c.moveTo(x,y); else c.lineTo(x,y);
  });
  c.stroke();
  // fill under curve
  c.lineTo(w,h); c.lineTo(0,h); c.closePath();
  c.fillStyle = grad; c.fill();
}


  // --- Suggest list from top20
  function applySuggestList(list){
    const dl = document.getElementById('suggestList');
    if(!dl) return;
    dl.innerHTML = '';
    list.forEach(a=>{
      const base = (a.symbol||'').toUpperCase();
      const opt = document.createElement('option');
      opt.value = (base==='USDT'||base==='USDC'?'BTC':base) + 'USDT';
      opt.label = a.name;
      dl.appendChild(opt);
    });
  }

  // Store last loaded assets for sorting modes
  let _topAssets = [];
  async function loadTopAssets(){
    const grid = document.getElementById('assetGrid');
    if(!grid) return;
    grid.innerHTML = '<div class="muted" style="padding:8px">Loading top assetsâ€¦</div>';
    try{
      const url = '/api/cg/top?vs=usd&limit=20';
      const res = await fetch(url, {cache:'no-store'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      _topAssets = data.slice(0, 30); // keep 30 for movers
      applySuggestList(_topAssets);
      renderTopAssets('mcap');
    }catch(e){
      grid.innerHTML = '<div class="muted" style="padding:8px">Unable to load top assets right now.</div>';
    }
  }

  function renderTopAssets(mode){
    const grid = document.getElementById('assetGrid');
    if(!grid) return;
    grid.innerHTML='';
    let arr = _topAssets.slice(0);
    if(mode==='movers1h'){
      arr.sort((a,b)=>Math.abs(b.price_change_percentage_1h_in_currency||0)-Math.abs(a.price_change_percentage_1h_in_currency||0));
    }else if(mode==='movers24h'){
      arr.sort((a,b)=>Math.abs(b.price_change_percentage_24h||0)-Math.abs(a.price_change_percentage_24h||0));
    }else{ // mcap
      arr.sort((a,b)=>(a.market_cap_rank||999)-(b.market_cap_rank||999));
    }
    arr = arr.slice(0,20);
    arr.forEach((a,i)=>{
      const base = (a.symbol||'').toUpperCase();
      let b = base; if(b==='USDT'||b==='USDC') b = 'BTC';
      const binanceSym = b + 'USDT';
      const chg1h = a.price_change_percentage_1h_in_currency;
      const chg24h = a.price_change_percentage_24h;
      const card = document.createElement('div');
      card.className = 'asset-card';
      card.setAttribute('data-symbol', binanceSym);
      card.innerHTML = `
        <div class="asset-rank">${a.market_cap_rank||i+1}</div>
        <img class="asset-logo" src="${a.image}" alt="${a.symbol}"/>
        <div class="asset-meta">
          <div class="row">
            <div class="asset-name">${a.name} <span class="muted">(${base})</span></div>
            <canvas class="tile-spark"></canvas>
          </div>
          <div class="row">
            <div class="asset-price">$${(a.current_price||0).toLocaleString()}</div>
            <div class="asset-chg ${(chg24h||0)>=0?'pos':'neg'}">${(chg24h||0).toFixed(2)}%</div>
          </div>
        </div>
        <div class="asset-add">${mode==='mcap'?'Set Pulse â†’':(mode==='movers1h'?'1h: '+(chg1h||0).toFixed(2)+'%':'24h: '+(chg24h||0).toFixed(2)+'%')}</div>
      `;
      card.addEventListener('click', ()=>{ try{ setSymbol && setSymbol(binanceSym);}catch(e){} window.scrollTo({top:0,behavior:'smooth'}); });
      grid.appendChild(card);
      try{ const sdata = a.sparkline_in_7d && a.sparkline_in_7d.price || []; drawTileSpark(card.querySelector('.tile-spark'), sdata, '#22d3ee', '#ef4444'); }catch(e){}
    });
  }

  // Mode toggles
  const topMode = document.getElementById('topMode');
  if(topMode){
    topMode.addEventListener('click', (e)=>{
      const b = e.target.closest('.seg'); if(!b) return;
      topMode.querySelectorAll('.seg').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      renderTopAssets(b.getAttribute('data-mode'));
    });
  }

  // Keyboard shortcut: S toggles sound
  document.addEventListener('keydown', (e)=>{
    if(e.key.toLowerCase()==='s'){ const b = document.getElementById('soundBtn'); if(b) b.click(); }
  });

  // Per-second sampler - v9
()=>{
    if(state.secCount>0){
      const avg = state.secSum / state.secCount;
      const last = state.lastSecPrice || avg;
      const dpct = ((avg - last)/last)*100;
      const vol = Math.min(Math.abs(dpct)*3, 3);
      // Feed ECG mood & info panel
      try{ updateFromMarket(dpct, vol); }catch(e){}
      // push to sparklines
      pushSpark(spark.price, avg);
      pushSpark(spark.vol, vol);
      const n = spark.price.length;
      if(n>5){
        const base = spark.price[Math.max(0, n-40)];
        pushSpark(spark.trend, avg - base);
      }
      drawSparkLive(pd.spPrice, spark.price, '#22d3ee', 'price');
      drawSparkLive(pd.spVol, spark.vol, '#eab308', 'vol');
      drawSparkLive(pd.spTrend, spark.trend, '#60a5fa', 'trend');
      state.lastSecPrice = avg;
      state.secSum = 0; state.secCount = 0;
    }
  }, 1000);

  function bumpChip(el){ if(!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  function drawTileSpark(canvas, data, posColor, negColor){
    if(!canvas || !data || !data.length) return;
    const r = Math.max(1, devicePixelRatio||1);
    const w = canvas.clientWidth*r, h= canvas.clientHeight*r;
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d');
    const min = Math.min(...data), max = Math.max(...data);
    const scale = v => h - (v-min)/(max-min||1)*h;
    const step = w/(data.length-1||1);
    const up = data[data.length-1] >= data[0];
    c.lineWidth = 1.8*r;
    c.strokeStyle = up ? (posColor||'#22d3ee') : (negColor||'#ef4444');
    c.beginPath();
    data.forEach((v,i)=>{ const x=i*step, y=scale(v); if(i===0) c.moveTo(x,y); else c.lineTo(x,y); }); c.stroke();
  }


  // ===== Interactive spark with overlays =====
  function drawSparkLive(canvas, data, color, kind){
    if(!canvas) return;
    const parent = canvas.parentElement;
    let tip = parent.querySelector('.spark-tip');
    if(!tip){
      tip = document.createElement('div');
      tip.className = 'spark-tip';
      tip.style.display = 'none';
      parent.appendChild(tip);
    }

    const r = Math.max(1, devicePixelRatio||1);
    const w = canvas.clientWidth*r, h = canvas.clientHeight*r;
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d');
    c.clearRect(0,0,w,h);

    // grid
    c.save();
    c.globalAlpha = 0.10;
    c.strokeStyle = '#5b7ab3';
    c.lineWidth = 1;
    const gy = 24*r, gx = 40*r;
    for(let x=0;x<w;x+=gx){ c.beginPath(); c.moveTo(x,0); c.lineTo(x,h); c.stroke(); }
    for(let y=0;y<h;y+=gy){ c.beginPath(); c.moveTo(0,y); c.lineTo(w,y); c.stroke(); }
    c.restore();

    if(!data || data.length<2) return;

    // scale
    let min = Math.min(...data), max = Math.max(...data);
    if(kind==='trend'){ min = Math.min(min, 0); max = Math.max(max, 0); } // include baseline 0
    const pad = (max-min)*0.08 || 1;
    min -= pad; max += pad;
    const scaleY = v => h - (v-min)/(max-min)*h;
    const step = w/(data.length-1);

    // stroke + fill
    c.lineWidth = 2*r;
    const grad = c.createLinearGradient(0,0,0,h);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(34,211,238,.04)');
    c.strokeStyle = color;
    c.beginPath();
    data.forEach((v,i)=>{ const x = i*step; const y = scaleY(v); if(i===0) c.moveTo(x,y); else c.lineTo(x,y); });
    c.stroke();
    c.lineTo(w,h); c.lineTo(0,h); c.closePath();
    c.fillStyle = grad; c.fill();

    // baseline line for trend
    if(kind==='trend'){
      const y0 = scaleY(0);
      c.strokeStyle = 'rgba(148,163,184,.35)';
      c.setLineDash([6*r, 6*r]);
      c.beginPath(); c.moveTo(0,y0); c.lineTo(w,y0); c.stroke();
      c.setLineDash([]);
    }

    // last value glow
    const lastY = scaleY(data[data.length-1]), lastX = (data.length-1)*step;
    c.fillStyle = color;
    c.beginPath(); c.arc(lastX, lastY, 3.5*r, 0, Math.PI*2); c.fill();
    c.globalAlpha = 0.25; c.beginPath(); c.arc(lastX, lastY, 10*r, 0, Math.PI*2); c.fill(); c.globalAlpha = 1;

    // hover crosshair + tooltip
    let pointer = null;
    function setTip(x, y, idx){
      const pretty = (n)=>{
        if(kind==='vol') return (n).toFixed(2);
        if(kind==='trend') return (n>=0?'+':'') + n.toFixed(4);
        return '$' + Number(n).toLocaleString();
      };
      tip.innerHTML = `<span class="muted">${kind==='price'?'Price':' '}${kind==='vol'?'Vol':''}${kind==='trend'?'Slope':''}</span> <strong>${pretty(data[idx])}</strong>`;
      tip.style.display = 'block';
      const pr = parent.getBoundingClientRect();
      tip.style.left = ( (idx*step)/r ) + 'px';
      tip.style.top  = ( (y)/r ) + 'px';
    }
    function clearTip(){ tip.style.display='none'; }

    canvas.onmousemove = (e)=>{
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * r;
      const y = (e.clientY - rect.top) * r;
      const idx = Math.max(0, Math.min(data.length-1, Math.round(x/step)));
      // crosshair
      c.save();
      c.strokeStyle = 'rgba(96,165,250,.6)';
      c.lineWidth = 1;
      c.setLineDash([4*r,3*r]);
      c.beginPath(); c.moveTo(idx*step, 0); c.lineTo(idx*step, h); c.stroke();
      c.restore();
      // redraw (simple approach: redraw entire chart for feedback)
      drawSparkLive(canvas, data, color, kind);
      setTip(x, y, idx);
    };
    canvas.onmouseleave = ()=>{ clearTip(); drawSparkLive(canvas, data, color, kind); };
  }

  // v9 seed: give the charts something to draw immediately
  ;(function seedSparks(){
    if(spark.price.length) return;
    let v = 100; for(let i=0;i<80;i++){ v += Math.sin(i/6)*0.5 + (Math.random()-0.5)*0.3; spark.price.push(v); }
    for(let i=0;i<80;i++){ spark.vol.push(Math.abs(Math.sin(i/10))*0.7 + 0.1); }
    for(let i=1;i<spark.price.length;i++){ spark.trend.push(spark.price[i]-spark.price[i-1]); }
    try{
      drawSparkLive(pd.spPrice, spark.price, '#22d3ee', 'price');
      drawSparkLive(pd.spVol, spark.vol, '#eab308', 'vol');
      drawSparkLive(pd.spTrend, spark.trend, '#60a5fa', 'trend');
    }catch(e){}
  })();

  // Per-second sampler - v9 (smoother + fallback)
  setInterval(()=>{
    const now = Date.now();
    // If no trades in > 5s, synthesize light noise so UI isn't empty
    if(now - state.lastTradeTs > 5000){
      const last = state.lastSecPrice || spark.price[spark.price.length-1] || 100;
      const synth = last + (Math.sin(now/1500)+Math.random()-0.5)*0.35;
      state.secSum += synth; state.secCount += 1;
    }
    if(state.secCount>0){
      const avg = state.secSum / state.secCount;
      const last = state.lastSecPrice || avg;
      const dpct = ((avg - last)/Math.max(1e-9,last))*100;
      const vol = Math.min(Math.abs(dpct)*3, 3);
      try{ updateFromMarket(dpct, vol); }catch(e){}
      // push & draw
      spark.price.push(avg); if(spark.price.length>spark.maxN) spark.price.shift();
      spark.vol.push(vol); if(spark.vol.length>spark.maxN) spark.vol.shift();
      const base = spark.price[Math.max(0, spark.price.length-40)] || avg;
      spark.trend.push(avg - base); if(spark.trend.length>spark.maxN) spark.trend.shift();
      try{
        drawSparkLive(pd.spPrice, spark.price, '#22d3ee', 'price');
        drawSparkLive(pd.spVol, spark.vol, '#eab308', 'vol');
        drawSparkLive(pd.spTrend, spark.trend, '#60a5fa', 'trend');
      }catch(e){}
      state.lastSecPrice = avg; state.secSum = 0; state.secCount = 0;
    }
  }, 1000);


  // ===== Positions & Liquidity =====
  const coinMap = {
    'BTC':'bitcoin','XBT':'bitcoin','ETH':'ethereum','BNB':'binancecoin','XRP':'ripple','ADA':'cardano',
    'DOGE':'dogecoin','SOL':'solana','MATIC':'matic-network','TRX':'tron','AVAX':'avalanche-2','DOT':'polkadot',
    'LINK':'chainlink','LTC':'litecoin','BCH':'bitcoin-cash','TON':'toncoin','APT':'aptos','ARB':'arbitrum',
    'OP':'optimism','NEAR':'near','ATOM':'cosmos','FIL':'filecoin','ETC':'ethereum-classic'
  };
  const pp = {
    gauge: document.getElementById('ppGauge'),
    longEl: document.getElementById('ppLong'),
    shortEl: document.getElementById('ppShort'),
    biasEl: document.getElementById('ppBias'),
    longZone: document.getElementById('ppLongZone'),
    longPrice: document.getElementById('ppLongPrice'),
    shortZone: document.getElementById('ppShortZone'),
    shortPrice: document.getElementById('ppShortPrice'),
    tfLabel: document.getElementById('ppTfLabel'),
  };
  let ppTf = 5; // minutes
  const ppCache = {}; // coinId -> {prices: [[ts,price], ...]}

  async function getCoinIdFromSymbol(sym){
    const base = (sym||'').replace('USDT','').toUpperCase();
    return coinMap[base] || 'bitcoin';
  }

  async function fetchCGMarketChart(coinId){
    if(ppCache[coinId]) return ppCache[coinId];
    try{
      const url = `/api/cg/market_chart?id=${coinId}&vs=usd&days=1&interval=minute      const res = await fetch(url, {cache:'no-store'});
      const json = await res.json();
      ppCache[coinId] = json;
      return json;
    }catch(e){ return null; }
  }

  function computeBias(prices, minutes){
    if(!prices || !prices.prices || prices.prices.length<3) return {long:50,short:50,bias:'Neutral', up:false};
    const arr = prices.prices; // [ts, price]
    const now = arr[arr.length-1][0];
    const cutoff = now - minutes*60*1000;
    let first = arr[0][1];
    for(let i=arr.length-1;i>=0;i--){ if(arr[i][0] <= cutoff){ first = arr[i][1]; break; } }
    const last = arr[arr.length-1][1];
    const ret = (last-first)/first*100;
    // map return to long/short
    let long = Math.max(0, Math.min(100, 50 + ret*8)); // +-6.25% => 100/0
    let short = 100 - long;
    let bias = Math.abs(ret)<0.2 ? 'Neutral' : (ret>0 ? 'Long' : 'Short');
    return {long, short, bias, up: ret>=0, ret, last};
  }

  function nearestZones(prices){
    if(!prices || !prices.prices || prices.prices.length<30) return {below: null, above: null, last: null};
    const arr = prices.prices;
    const last = arr[arr.length-1][1];
    // detect local extrema with window=5
    const highs=[], lows=[];
    for(let i=5;i<arr.length-5;i++){
      const p = arr[i][1];
      let high=true, low=true;
      for(let k=-3;k<=3;k++){ if(arr[i+k][1]>p) low=false; if(arr[i+k][1]<p) high=false; }
      if(high) highs.push(p);
      if(low) lows.push(p);
    }
    // nearest above/below
    let above = null, below = null, da=1e12, db=1e12;
    highs.forEach(p=>{ if(p>last && p-last<da){da=p-last; above=p} });
    lows.forEach(p=>{ if(p<last && last-p<db){db=last-p; below=p} });
    return {below, above, last};
  }

  function drawDonut(canvas, longPct){
    if(!canvas) return;
    const r = Math.max(1, devicePixelRatio||1);
    const w = canvas.clientWidth*r, h = canvas.clientHeight*r;
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d');
    c.clearRect(0,0,w,h);
    const cx=w/2, cy=h*0.9, R=Math.min(w*0.45, h*0.85);
    // base arc
    c.lineWidth = 12*r;
    c.strokeStyle = '#1f2a44';
    c.beginPath(); c.arc(cx,cy,R,Math.PI,2*Math.PI); c.stroke();
    // long arc
    const a1=Math.PI, a2 = Math.PI + (longPct/100)*Math.PI;
    const grd1 = c.createLinearGradient(0,0,w,0);
    grd1.addColorStop(0,'#22c55e'); grd1.addColorStop(1,'#60f2a9');
    c.strokeStyle = grd1;
    c.beginPath(); c.arc(cx,cy,R,a1,a2); c.stroke();
    // short arc
    const s1 = a2, s2 = 2*Math.PI;
    const grd2 = c.createLinearGradient(0,0,w,0);
    grd2.addColorStop(0,'#ef4444'); grd2.addColorStop(1,'#f59e0b');
    c.strokeStyle = grd2;
    c.beginPath(); c.arc(cx,cy,R,s1,s2); c.stroke();
  }

  async function updatePositions(sym){
    if(!pp.gauge) return;
    const coinId = await getCoinIdFromSymbol(sym||symbol);
    const data = await fetchCGMarketChart(coinId);
    const bias = computeBias(data, ppTf);
    drawDonut(pp.gauge, bias.long);
    pp.longEl && (pp.longEl.textContent = bias.long.toFixed(0)+'%');
    pp.shortEl && (pp.shortEl.textContent = bias.short.toFixed(0)+'%');
    pp.biasEl && (pp.biasEl.textContent = 'Bias: ' + bias.bias);
    // zones
    const z = nearestZones(data);
    if(z.last){
      if(z.below){
        const dist = Math.max(0, (z.last - z.below)/z.last * 100);
        drawHeatmap(document.getElementById('ppLongHeat'), z.last, z.below, 'long');
        pp.longPrice && (pp.longPrice.textContent = '$' + z.below.toFixed(2) + ` (${dist.toFixed(2)}%)`)
      }else{ pp.longZone && (pp.longZone.style.width='0%'); pp.longPrice && (pp.longPrice.textContent='â€”'); }
      if(z.above){
        const dist = Math.max(0, (z.above - z.last)/z.last * 100);
        drawHeatmap(document.getElementById('ppShortHeat'), z.last, z.above, 'short');
        pp.shortPrice && (pp.shortPrice.textContent = '$' + z.above.toFixed(2) + ` (${dist.toFixed(2)}%)`)
      }else{ pp.shortZone && (pp.shortZone.style.width='0%'); pp.shortPrice && (pp.shortPrice.textContent='â€”'); }
    }
    // label
    pp.tfLabel && (pp.tfLabel.textContent = ppTf===60 ? '1h' : (ppTf+'m'));
  }

  // timeframe seg
  const ppTfSeg = document.getElementById('ppTf');
  if(ppTfSeg){
    ppTfSeg.addEventListener('click', (e)=>{
      const b = e.target.closest('.seg'); if(!b) return;
      ppTfSeg.querySelectorAll('.seg').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      ppTf = parseInt(b.getAttribute('data-min'), 10);
      updatePositions(symbol);
    });
  }

  // Hook into symbol changes
  const _origSetSymbol = setSymbol;
  setSymbol = function(sym){ _origSetSymbol(sym); try{ updatePositions(sym); }catch(e){} };

  // Initial call
  window.addEventListener('DOMContentLoaded', ()=>{ try{ updatePositions(symbol); }catch(e){} });

  function drawDonut(canvas, longPct){
    if(!canvas) return;
    const r = Math.max(1, devicePixelRatio||1);
    const w = canvas.clientWidth*r, h = canvas.clientHeight*r;
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d');
    c.clearRect(0,0,w,h);
    const cx=w/2, cy=h/2, R=Math.min(w,h)*0.42, T=14*r;

    // base ring
    c.lineWidth = T; c.strokeStyle = '#1f2a44';
    c.beginPath(); c.arc(cx,cy,R,0,Math.PI*2); c.stroke();

    // long arc
    const lp = Math.max(0, Math.min(100, longPct));
    const la = (lp/100)*Math.PI*2;
    const grdG = c.createLinearGradient(0,0,w,0);
    grdG.addColorStop(0,'#22c55e'); grdG.addColorStop(1,'#60f2a9');
    c.strokeStyle = grdG;
    c.beginPath(); c.arc(cx,cy,R,-Math.PI/2, -Math.PI/2 + la); c.stroke();

    // short arc
    const sp = 100-lp;
    const grdR = c.createLinearGradient(0,0,w,0);
    grdR.addColorStop(0,'#ef4444'); grdR.addColorStop(1,'#f59e0b');
    c.strokeStyle = grdR;
    c.beginPath(); c.arc(cx,cy,R,-Math.PI/2 + la, -Math.PI/2 + Math.PI*2); c.stroke();

    // center text
    c.fillStyle = '#e2e8f0'; c.font = `${14*r}px ui-sans-serif, system-ui`; c.textAlign='center';
    c.fillText('Long', cx, cy - 6*r);
    c.font = `${20*r}px ui-sans-serif, system-ui`; c.fillStyle = '#22d3ee';
    c.fillText(`${Math.round(lp)}%`, cx, cy + 18*r);
  }

  function drawHeatmap(canvas, last, zone, side){
    if(!canvas) return;
    const r = Math.max(1, devicePixelRatio||1);
    const w = canvas.clientWidth*r, h = canvas.clientHeight*r;
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d');
    c.clearRect(0,0,w,h);

    // Grid bands
    c.save(); c.globalAlpha=.08; c.strokeStyle='#5b7ab3';
    for(let y=0;y<h;y+=24*r){ c.beginPath(); c.moveTo(0,y); c.lineTo(w,y); c.stroke(); }
    c.restore();

    if(!last || !zone){ return; }

    // Define range around last +/-5%
    const min = last*0.95, max = last*1.05;
    const bins = 60;
    const scaleY = v => h - (v-min)/(max-min) * h;

    // Gaussian centered at zone
    function gauss(x, mu, s){ const d=(x-mu)/s; return Math.exp(-0.5*d*d); }
    const s = last*0.003; // spread (~0.3%)

    for(let i=0;i<bins;i++){
      const v = min + (i/(bins-1))*(max-min);
      const intensity = gauss(v, zone, s);
      const y0 = scaleY(v);
      const y1 = scaleY(min + ((i+1)/(bins-1))*(max-min));
      const hgt = Math.max(1, y1-y0);
      const grd = c.createLinearGradient(0,y0, w, y1);
      if(side === 'long'){ grd.addColorStop(0, `rgba(34,197,94,${0.15+0.45*intensity})`); grd.addColorStop(1, `rgba(96,242,169,${0.12+0.40*intensity})`); }
      else { grd.addColorStop(0, `rgba(239,68,68,${0.15+0.45*intensity})`); grd.addColorStop(1, `rgba(245,158,11,${0.12+0.40*intensity})`); }
      c.fillStyle = grd; c.fillRect(0, y0, w, hgt);
    }

    // Current price line
    const yLast = scaleY(last);
    c.strokeStyle = '#22d3ee'; c.lineWidth = 2*r;
    c.beginPath(); c.moveTo(0,yLast); c.lineTo(w,yLast); c.stroke();

    // Zone line
    const yZone = scaleY(zone);
    c.setLineDash([6*r, 6*r]); c.lineWidth = 2*r;
    c.strokeStyle = side==='long' ? '#22c55e' : '#ef4444';
    c.beginPath(); c.moveTo(0,yZone); c.lineTo(w,yZone); c.stroke();
    c.setLineDash([]);
  }


// ===== Alpha Snapshot (clean) =====
let asWindowMin = 60;
const asEls = {
  chg: document.getElementById('asChg'),
  vol: document.getElementById('asVol'),
  range: document.getElementById('asRange'),
  rangeBar: document.getElementById('asRangeBar'),
  beta: document.getElementById('asBeta'),
  hist: document.getElementById('asHist'),
  roll: document.getElementById('asRoll'),
  cues: document.getElementById('asCues'),
};

function drawHist(canvas, data, bins=25){
  if(!canvas || !data || !data.length) return;
  const r = Math.max(1, devicePixelRatio||1);
  const w = canvas.clientWidth*r, h = canvas.clientHeight*r;
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d'); c.clearRect(0,0,w,h);
  const min = Math.min(...data), max = Math.max(...data);
  const binw = (max-min || 1) / bins, counts = Array(bins).fill(0);
  data.forEach(v=>{ const i=Math.min(bins-1, Math.max(0, Math.floor((v-min)/binw))); counts[i]++; });
  const maxCt = Math.max(...counts) || 1, barW = w/bins;
  for(let i=0;i<bins;i++){ const x=i*barW+1*r, hgt=(counts[i]/maxCt)*(h*0.9), y=h-hgt, val=min+i*binw;
    const pos=val>=0; c.fillStyle = pos?'rgba(34,211,238,.85)':'rgba(239,68,68,.85)'; c.fillRect(x,y,barW-2*r,hgt); }
  const zeroX=(0-min)/(max-min || 1)*w; c.fillStyle='rgba(148,163,184,.35)'; c.fillRect(zeroX,0,1*r,h);
}
function drawRoll(canvas, data, color='#60a5fa'){
  if(!canvas || !data || !data.length) return;
  const r = Math.max(1, devicePixelRatio||1);
  const w = canvas.clientWidth*r, h = canvas.clientHeight*r;
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d'); c.clearRect(0,0,w,h);
  const min=Math.min(...data), max=Math.max(...data), pad=(max-min)*0.1||1;
  const vmin=min-pad, vmax=max+pad, scaleY=v=>h-(v-vmin)/(vmax-vmin)*h, step=w/(data.length-1);
  const grad=c.createLinearGradient(0,0,0,h); grad.addColorStop(0,color); grad.addColorStop(1,'rgba(34,211,238,.05)');
  c.lineWidth=2*r; c.strokeStyle=color; c.beginPath();
  data.forEach((v,i)=>{ const x=i*step, y=scaleY(v); if(i===0)c.moveTo(x,y); else c.lineTo(x,y); });
  c.stroke(); c.lineTo(w,h); c.lineTo(0,h); c.closePath(); c.fillStyle=grad; c.fill();
}

function statsFromPrices(arr, minutes){
  if(!arr || !arr.length) return null;
  const now=arr[arr.length-1][0], cutoff=now-minutes*60*1000, slice=arr.filter(p=>p[0]>=cutoff);
  if(slice.length<5) return null;
  const prices=slice.map(x=>x[1]), first=prices[0], last=prices[prices.length-1], chg=(last-first)/first*100;
  const rets=[]; for(let i=1;i<prices.length;i++){ rets.push(Math.log(prices[i]/prices[i-1])); }
  const mean=rets.reduce((a,b)=>a+b,0)/(rets.length||1);
  const variance=rets.reduce((a,b)=>a+(b-mean)*(b-mean),0)/(rets.length||1);
  const realized=Math.sqrt(variance)*Math.sqrt(60);
  const roll=[]; for(let i=20;i<rets.length;i++){ const seg=rets.slice(i-20,i);
    const m=seg.reduce((a,b)=>a+b,0)/seg.length; const v=Math.sqrt(seg.reduce((a,b)=>a+(b-m)*(b-m),0)/seg.length);
    roll.push(v*Math.sqrt(60)); }
  const hi=Math.max(...prices), lo=Math.min(...prices); const pos=(last-lo)/(hi-lo||1)*100;
  return {first,last,chg,realized,roll,hi,lo,pos,prices,rets};
}

function betaToBTC(series, btcSeries, minutes){
  if(!series || !btcSeries) return null;
  const now=series.prices[series.prices.length-1][0], cutoff=now-minutes*60*1000;
  const s=series.prices.filter(p=>p[0]>=cutoff).map(p=>p[1]);
  const b=btcSeries.prices.filter(p=>p[0]>=cutoff).map(p=>p[1]);
  const n=Math.min(s.length,b.length); if(n<10) return null;
  const rs=[], rb=[]; for(let i=1;i<n;i++){ rs.push(Math.log(s[i]/s[i-1])); rb.push(Math.log(b[i]/b[i-1])); }
  const ms=rs.reduce((a,c)=>a+c,0)/rs.length, mb=rb.reduce((a,c)=>a+c,0)/rb.length;
  let cov=0, varB=0; for(let i=0;i<rs.length;i++){ const ds=rs[i]-ms, db=rb[i]-mb; cov+=ds*db; varB+=db*db; }
  cov/=rs.length||1; varB/=rs.length||1; return varB? (cov/varB): null;
}

function playbookFrom(chg, vol, pos){
  const cues=[];
  if(chg>1 && vol<0.6) cues.push('Grinding up: trend-follow adds on pullbacks.');
  if(chg<-1 && vol>0.8) cues.push('Volatile selloff: fade bounces with tight risk.');
  if(pos>80) cues.push('Near 24h high: watch breakouts / mean-revert shorts.');
  if(pos<20) cues.push('Near 24h low: mean-revert longs on flip.');
  if(vol>1.2) cues.push('High vol: widen stops and reduce size.');
  if(!cues.length) cues.push('Balanced: wait for momentum trigger / liquidity sweep.');
  return cues;
}

async function updateAlpha(sym){
  try{
    const id = await getCoinIdFromSymbol(sym||symbol);
    const data = await fetchCGMarketChart(id); if(!data) return;
    const btc = await fetchCGMarketChart('bitcoin');
    const st = statsFromPrices(data.prices, asWindowMin); if(!st) return;
    // metrics
    asEls.chg && (asEls.chg.textContent = (st.chg>=0?'+':'')+st.chg.toFixed(2)+'%');
    asEls.vol && (asEls.vol.textContent = st.realized.toFixed(2));
    asEls.range && (asEls.range.textContent = '$'+st.lo.toFixed(2)+' â†’ $'+st.hi.toFixed(2));
    asEls.rangeBar && (asEls.rangeBar.style.width = Math.max(0,Math.min(100,st.pos)).toFixed(0)+'%');
    const beta = betaToBTC(data, btc, asWindowMin);
    asEls.beta && (asEls.beta.textContent = beta!==null ? beta.toFixed(2) : 'â€”');
    // charts
    const retsBps = st.rets.map(x=>x*100);
    drawHist(asEls.hist, retsBps, 25);
    drawRoll(asEls.roll, st.roll);
    // playbook
    if(asEls.cues){ asEls.cues.innerHTML=''; playbookFrom(st.chg, st.realized, st.pos).forEach(t=>{ const li=document.createElement('li'); li.textContent=t; asEls.cues.appendChild(li); }); }
  }catch(e){ /* silent */ }
}

// timeframe control
const asSeg = document.getElementById('asWindow');
if(asSeg){
  asSeg.addEventListener('click', (e)=>{
    const b=e.target.closest('.seg'); if(!b) return;
    asSeg.querySelectorAll('.seg').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    asWindowMin = parseInt(b.getAttribute('data-min'), 10);
    updateAlpha(symbol);
  });
}

// Chain setSymbol safely once
(function(){
  const prev = window.setSymbol;
  if(!prev || prev._alphaPatched) return;
  function chained(sym){ prev(sym); try{ updateAlpha(sym); }catch(e){} }
  chained._alphaPatched = true;
  window.setSymbol = chained;
})();

window.addEventListener('DOMContentLoaded', ()=>{ try{ updateAlpha(symbol); }catch(e){} });

// ===== Market Depth gauge (mini) =====
(function(){
  const gEl = document.getElementById('depthGauge');
  const bidEl = document.getElementById('depthBid');
  const askEl = document.getElementById('depthAsk');
  if(!gEl) return;

  async function fetchDepth(sym){
    try{
      const s = (sym||symbol||'BTCUSDT').toUpperCase();
      const url = `/api/depth?symbol=${s}&limit=50&levels=25&venue=binance      const res = await fetch(url, {cache:'no-store'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const j = await res.json();
      let bid=0, ask=0;
      j.bids.slice(0,25).forEach(([p,q])=>{ bid += parseFloat(p)*parseFloat(q); });
      j.asks.slice(0,25).forEach(([p,q])=>{ ask += parseFloat(p)*parseFloat(q); });
      const total = bid+ask || 1;
      return {bidPct: bid/total*100, askPct: ask/total*100};
    }catch(e){ return null; }
  }

  function drawHalfGauge(canvas, bidPct, askPct){
    const r = Math.max(1, devicePixelRatio||1);
    const w = canvas.clientWidth*r, h = canvas.clientHeight*r;
    canvas.width=w; canvas.height=h;
    const c = canvas.getContext('2d');
    c.clearRect(0,0,w,h);
    const cx=w/2, cy=h*0.95, R=Math.min(w*0.45, h*0.9), T=12*r;
    c.lineWidth=T; c.strokeStyle='#1f2a44';
    c.beginPath(); c.arc(cx,cy,R,Math.PI,2*Math.PI); c.stroke();
    const bAng = Math.PI + (Math.min(100,Math.max(0,bidPct))/100)*Math.PI;
    const g1=c.createLinearGradient(0,0,w,0); g1.addColorStop(0,'#22c55e'); g1.addColorStop(1,'#60f2a9');
    c.strokeStyle=g1; c.beginPath(); c.arc(cx,cy,R,Math.PI,bAng); c.stroke();
    const g2=c.createLinearGradient(0,0,w,0); g2.addColorStop(0,'#ef4444'); g2.addColorStop(1,'#f59e0b');
    c.strokeStyle=g2; c.beginPath(); c.arc(cx,cy,R,bAng,2*Math.PI); c.stroke();
    const balance = (bidPct - askPct);
    const t = (balance+100)/200;
    const ang = Math.PI + t*Math.PI;
    const nx = cx + Math.cos(ang)*(R-6*r), ny = cy + Math.sin(ang)*(R-6*r);
    c.lineWidth=2*r; c.strokeStyle='#22d3ee'; c.beginPath(); c.moveTo(cx,cy); c.lineTo(nx,ny); c.stroke();
    c.fillStyle='#22d3ee'; c.beginPath(); c.arc(cx,cy,3.2*r,0,Math.PI*2); c.fill();
  }

  async function refreshDepth(){
    const d = await fetchDepth(symbol);
    if(!d) return;
    bidEl && (bidEl.textContent = d.bidPct.toFixed(0)+'%');
    askEl && (askEl.textContent = d.askPct.toFixed(0)+'%');
    drawHalfGauge(gEl, d.bidPct, d.askPct);
  }

  const prev = window.setSymbol;
  window.setSymbol = function(sym){ prev(sym); refreshDepth(); };
  refreshDepth();
  setInterval(refreshDepth, 20000);
})();

