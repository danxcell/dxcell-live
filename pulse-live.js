// File: pulse-live.js
(() => {
  const $ = (s) => document.querySelector(s);

  // DOM
  const chipSym   = $('#pulseSymbol');
  const chipBpm   = $('#pulseBpm');
  const chipState = $('#pulseState');
  const priceEl   = $('#pdPrice');
  const titleSym  = $('#pdSymbol');
  const subEl     = $('#pdSubtitle');
  const trendEl   = $('#pdTrend');
  const regimeEl  = $('#pdRegime');
  const riskEl    = $('#pdRisk');

  const cECG   = $('#pulseCanvas');
  const cSP    = $('#sparkPrice');
  const cSV    = $('#sparkVol');
  const cST    = $('#sparkTrend');

  // state
  const S = {
    symbol: 'BTCUSDT',
    lastCoin: null,
    priceSpark: [],
    volSpark: [],
    trendSpark: [],
    maxSpark: 80,
    bpm: 80,
    state: 'steady'
  };

  // helpers
  function getSymbol() {
    const chip = chipSym && chipSym.textContent.trim();
    if (chip && chip !== '—') return chip.toUpperCase();
    if (window.CURRENT?.symbol) return String(window.CURRENT.symbol).toUpperCase();
    return S.symbol;
  }

  function baseFromPair(sym) {
    // BTCUSDT -> btc ; ETHUSD -> eth ; XRPBTC -> xrp, etc.
    const m = String(sym).toUpperCase().match(/^([A-Z0-9]+?)(USDT|USD|EUR|GBP|BTC|ETH)$/);
    return (m ? m[1] : sym).toLowerCase();
  }

  async function fetchTop() {
    const r = await fetch('/api/cg/top?limit=250', { cache: 'no-store' });
    if (!r.ok) throw new Error('cg/top '+r.status);
    return r.json();
  }

  function pickCoin(list, baseSymLower) {
    // Prefer exact symbol match; fall back to first item with same name prefix
    let coin = list.find(c => (c.symbol||'').toLowerCase() === baseSymLower);
    if (!coin) {
      coin = list.find(c => (c.name||'').toLowerCase().startsWith(baseSymLower));
    }
    return coin || null;
  }

  // --- UI updates
  function fmt(n, dp=2) { 
    if (n == null || !isFinite(n)) return '—';
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  function badgeTrend(p1h, p24h) {
    if (p1h > 0.8 && p24h > 1) return 'UP';
    if (p1h < -0.8 && p24h < -1) return 'DOWN';
    return 'SIDE';
  }
  function badgeRegime(vol) {
    if (vol > 4) return 'HIGH VOL';
    if (vol > 2) return 'MED VOL';
    return 'LOW VOL';
    // you can swap to ATR/true vol later
  }
  function badgeRisk(p24h, vol) {
    const score = Math.abs(p24h) * 0.6 + vol * 0.4;
    if (score >= 8) return 'ELEVATED';
    if (score >= 4) return 'MODERATE';
    return 'CALM';
  }

  function setBadges(coin) {
    const p1h  = coin.price_change_percentage_1h_in_currency ?? 0;
    const p24h = coin.price_change_percentage_24h_in_currency ?? 0;
    const vol  = Math.abs(p1h) * 1.2 + Math.abs(p24h) * 0.5; // synthetic "vol" signal
    const tr   = badgeTrend(p1h, p24h);
    const rg   = badgeRegime(vol);
    const rk   = badgeRisk(p24h, vol);

    if (trendEl)  trendEl.textContent  = `Trend: ${tr}`;
    if (regimeEl) regimeEl.textContent = `Regime: ${rg}`;
    if (riskEl)   riskEl.textContent   = `Risk: ${rk}`;

    // map to BPM/state for ECG
    const base = 70;
    const bpm  = Math.max(55, Math.min(170, base + p24h*2 + vol*2));
    S.bpm   = bpm;
    S.state = (p24h > 1.5 ? 'surge' : p24h < -1.5 ? 'stress' : 'steady');

    if (chipBpm)   chipBpm.textContent   = Math.round(bpm);
    if (chipState) chipState.textContent = S.state.toUpperCase();
  }

  function updateInfo(coin, sym) {
    if (titleSym) titleSym.textContent = sym;
    if (subEl)    subEl.textContent    = coin.name ? `${coin.name} — rank #${coin.market_cap_rank}` : '—';
    if (priceEl)  priceEl.textContent  = coin.current_price != null ? `$${fmt(coin.current_price, 2)}` : '—';
  }

  // --- drawing utils (sparks + ECG)
  function sizeCanvas(cv, w, h) {
    const dpr = window.devicePixelRatio || 1;
    cv.width  = Math.floor(w * dpr);
    cv.height = Math.floor(h * dpr);
    cv.style.width  = w + 'px';
    cv.style.height = h + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function drawSpark(cv, values, color='#22d3ee') {
    if (!cv || values.length < 2) return;
    const W = Math.max(cv.clientWidth || 180, 160);
    const H = Math.max(cv.clientHeight || 60, 48);
    const ctx = sizeCanvas(cv, W, H);
    ctx.clearRect(0,0,W,H);

    const min = Math.min(...values), max = Math.max(...values);
    const pad = 6, span = (max - min) || 1;
    ctx.strokeStyle = 'rgba(148,163,184,.12)'; // baseline
    ctx.beginPath(); ctx.moveTo(pad, H-1.5); ctx.lineTo(W-pad, H-1.5); ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.beginPath();
    values.forEach((v,i) => {
      const x = pad + (W-2*pad) * (i/(values.length-1));
      const y = H - pad - (H-2*pad) * ((v - min) / span);
      i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
    });
    ctx.stroke();
  }

  // ECG animator
  const ECG = (() => {
    let t0 = 0, raf = 0;
    function draw(cv, bpm, mode='steady') {
      const W = cv.clientWidth || 880, H = Math.max(cv.clientHeight || 220, 160);
      const ctx = sizeCanvas(cv, W, H);
      ctx.clearRect(0,0,W,H);
      const mid = H * 0.6;
      const msPerBeat = 60000 / Math.max(40, Math.min(200, bpm));
      const now = performance.now();
      if (!t0) t0 = now;
      const phase = ((now - t0) % msPerBeat) / msPerBeat;

      // base line glow
      ctx.strokeStyle = 'rgba(34,211,238,.15)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();

      // waveform
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;

      ctx.beginPath();
      const spikes = mode === 'surge' ? 2 : mode === 'stress' ? 0.5 : 1;
      for (let x = 0; x <= W; x++) {
        const p   = (phase + x / W) % 1;
        const beatShape =
          p < 0.08 ? 0 :
          p < 0.12 ? (p-0.1)*-900 :  // sharp down
          p < 0.16 ? (p-0.14)*900 :  // sharp up
          Math.sin((p-0.16) * Math.PI * 2 * spikes) * 0.2;
        const amp = mode === 'stress' ? 26 : mode === 'surge' ? 34 : 30;
        const y = mid - beatShape * amp;
        x ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
      }
      ctx.stroke();
    }
    function loop(cv, bpmFn, modeFn) {
      cancelAnimationFrame(raf);
      const tick = () => {
        draw(cv, bpmFn(), modeFn());
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return { loop };
  })();

  // main tick
  async function tick() {
    const sym = getSymbol();
    const base = baseFromPair(sym);

    try {
      const top = await fetchTop();
      const coin = pickCoin(top, base);
      if (!coin) throw new Error('coin not found in top list for '+sym);

      S.lastCoin = coin;

      // Keep sparks
      const price = Number(coin.current_price) || 0;
      const vol   = Math.abs(Number(coin.price_change_percentage_24h_in_currency) || 0);
      const trend = Number(coin.price_change_percentage_1h_in_currency) || 0;

      S.priceSpark.push(price);
      S.volSpark.push(vol);
      S.trendSpark.push(trend);
      if (S.priceSpark.length > S.maxSpark) S.priceSpark.shift();
      if (S.volSpark.length   > S.maxSpark) S.volSpark.shift();
      if (S.trendSpark.length > S.maxSpark) S.trendSpark.shift();

      // UI
      updateInfo(coin, sym);
      setBadges(coin);

      // Draw sparks
      drawSpark(cSP, S.priceSpark, '#22d3ee');
      drawSpark(cSV, S.volSpark,   '#a78bfa');
      drawSpark(cST, S.trendSpark, '#34d399');

      // reflect symbol chip if empty
      if (chipSym && chipSym.textContent.trim() === '—') chipSym.textContent = sym;
    } catch (e) {
      console.warn('pulse-live tick error', e);
    }
  }

  // wire search Set → updates symbol and triggers tick immediately
  (function wireSet(){
    const setBtn = document.getElementById('pulseSet');
    const input  = document.getElementById('pulseSearch');
    if (setBtn && input) {
      setBtn.addEventListener('click', () => {
        const v = (input.value||'').trim().toUpperCase();
        if (!v) return;
        if (chipSym) chipSym.textContent = v;
        window.CURRENT = Object.assign({}, window.CURRENT, { symbol: v });
        window.dispatchEvent(new CustomEvent('dxlt:set-symbol', { detail: { symbol: v } }));
        tick(); // immediate refresh
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') setBtn.click(); });
    }
  })();

  // react if other parts of UI set symbol
  window.addEventListener('dxlt:set-symbol', tick);

  // ECG loop — runs continuously with live BPM/state
  if (cECG) {
    ECG.loop(cECG, () => S.bpm, () => S.state);
  }

  // start
  document.addEventListener('DOMContentLoaded', () => {
    // initial symbol: keep previous chip if set, else default
    if (chipSym && chipSym.textContent.trim() !== '—') S.symbol = chipSym.textContent.trim().toUpperCase();
    tick();
    setInterval(tick, 15000);
  });
})();
