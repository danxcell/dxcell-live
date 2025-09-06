
(function(){
  const $=(s)=>document.querySelector(s);
  const $$=(s)=>Array.from(document.querySelectorAll(s));
  const PERIOD_TO_INTERVAL = { "1m":"1m", "5m":"5m","15m":"15m","1h":"1h","24h":"1h", "1w":"1w"};

  function mapToBinance(sym){
    if(/USDT$/.test(sym)) return sym;
    const m={"BTC":"BTCUSDT","ETH":"ETHUSDT","SOL":"SOLUSDT","ADA":"ADAUSDT","XRP":"XRPUSDT","AVAX":"AVAXUSDT","NEAR":"NEARUSDT","ATOM":"ATOMUSDT","SUI":"SUIUSDT","SEI":"SEIUSDT","APE":"APEUSDT","AR":"ARUSDT","FET":"FETUSDT","PEPE":"PEPEUSDT","SHIB":"SHIBUSDT","CRV":"CRVUSDT","COMP":"COMPUSDT","RUNE":"RUNEUSDT","GMX":"GMXUSDT","MKR":"MKRUSDT","UNI":"UNIUSDT","AAVE":"AAVEUSDT","SNX":"SNXUSDT","CAKE":"CAKEUSDT","RNDR":"RNDRUSDT","GRT":"GRTUSDT","AGIX":"AGIXUSDT","TON":"TONUSDT","OP":"OPUSDT","ARB":"ARBUSDT","DOT":"DOTUSDT","LINK":"LINKUSDT","MATIC":"MATICUSDT","BNB":"BNBUSDT"};
    return m[sym] || (sym + "USDT");
  }

  // math helpers
  const ema=(a,p)=>{const k=2/(p+1);let e=a[0];const o=[e];for(let i=1;i<a.length;i++){e=a[i]*k+e*(1-k);o.push(e)}return o};
  function rsi(c,p=14){let g=[],l=[];for(let i=1;i<c.length;i++){const d=c[i]-c[i-1];g.push(Math.max(0,d));l.push(Math.max(0,-d))}let ag=g.slice(0,p).reduce((a,b)=>a+b,0)/p;let al=l.slice(0,p).reduce((a,b)=>a+b,0)/p;let rs=al===0?100:ag/al;let res=[100-(100/(1+rs))];for(let i=p;i<g.length;i++){ag=(ag*(p-1)+g[i])/p;al=(al*(p-1)+l[i])/p;rs=al===0?100:ag/al;res.push(100-(100/(1+rs)))}return res}
  function stoch(h,l,c,p=14){const o=[];for(let i=0;i<c.length;i++){const s=Math.max(0,i-p+1);const hh=Math.max(...h.slice(s,i+1));const ll=Math.min(...l.slice(s,i+1));o.push(((c[i]-ll)/Math.max(1e-9,hh-ll))*100)}return o}
  function atr(h,l,c,p=14){const tr=[h[0]-l[0]];for(let i=1;i<c.length;i++){const hl=h[i]-l[i],hc=Math.abs(h[i]-c[i-1]),lc=Math.abs(l[i]-c[i-1]);tr.push(Math.max(hl,hc,lc))}const o=[];let s=tr.slice(0,p).reduce((a,b)=>a+b,0);o[p-1]=s/p;for(let i=p;i<tr.length;i++){o[i]=(o[i-1]*(p-1)+tr[i])/p}return o}
  function obv(c,v){let r=[0];for(let i=1;i<c.length;i++){const d=c[i]>c[i-1]?1:c[i]<c[i-1]?-1:0;r[i]=r[i-1]+d*v[i]}return r}
  function vwap(h,l,c,v){let pv=0,vv=0,out=[];for(let i=0;i<c.length;i++){const tp=(h[i]+l[i]+c[i])/3;pv+=tp*v[i];vv+=v[i];out[i]=pv/Math.max(1e-9,vv)}return out}

  let CURRENT={sym:"BTC", period:"24h"}, ctrl=null, FILTER="all";

  async function fetchKlines(sym, period){
    const interval = PERIOD_TO_INTERVAL[period] || "1h";
    const limit = interval==="5m" ? 300 : interval==="15m" ? 300 : 400;
    const symbol = mapToBinance(sym);
    const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
    if (ctrl) try{ ctrl.abort(); }catch(e){}
    ctrl = new AbortController();
    const r = await fetch(url, {signal:ctrl.signal});
    if (!r.ok) throw new Error("klines");
    const raw = await r.json();
    const h=[],l=[],c=[],v=[]; raw.forEach(k=>{h.push(+k[2]);l.push(+k[3]);c.push(+k[4]);v.push(+k[5]);});
    return {h,l,c,v};
  }

  function buildRows(h,l,c,v){
    const rsi14 = rsi(c,14).at(-1)||NaN;
    const stoch14 = stoch(h,l,c,14).at(-1)||NaN;
    const e20=ema(c,20).at(-1)||NaN, e50=ema(c,50).at(-1)||NaN;
    const e12=ema(c,12), e26=ema(c,26); const macdLine=(e12.at(-1)||0)-(e26.at(-1)||0);
    const macdHist=(function(){const m=[];for(let i=0;i<c.length;i++){m[i]=(e12[i]||0)-(e26[i]||0)}return (ema(m,9).at(-1)||0)})();
    const atrPct=((atr(h,l,c,14).at(-1)||0)/Math.max(1e-9,c.at(-1)))*100;
    const obvArr=obv(c,v); const obvPct=((obvArr.at(-1)||0)-(obvArr.at(-20)||0))/Math.max(1e-9,Math.abs(obvArr.at(-20)||1))*100;
    const vwapArr=vwap(h,l,c,v); const vwapDev=((c.at(-1)-vwapArr.at(-1))/Math.max(1e-9,vwapArr.at(-1)))*100;
    // proxies
    const adxProxy = Math.min(60, Math.abs((e20-e50)/(c.at(-1)||1))*8000); // trend strength proxy
    const depthProxy = (v.at(-1)||0)/(ema(v,20).at(-1)||1)*50; // liquidity proxy
    const halfTrend = (ema(c,10).at(-1)||0)>(ema(c,20).at(-1)||0) ? "Bullish" : "Bearish";
    const lsRatio = (c.slice(-50).filter((x,i,a)=> i>0 && x>a[i-1]).length)/50; // up candle ratio

    // meters
    const trendScore = [(rsi14-50)/50, macdHist>0?0.5:-0.5, e20>e50?0.5:-0.5, -Math.sign(vwapDev)*0.25].reduce((a,b)=>a+b,0);
    const bullP = Math.max(0, Math.min(1, 0.5 + trendScore/2)) * 100;
    const bearP = 100 - bullP;
    const neutralP = Math.max(0, 100 - Math.abs(50 - bullP)*2);

    const rows = [
      {group:"momentum", name:"RSI(14)", chip:Math.round(rsi14)+"", sub:rsi14>70?"High":rsi14<30?"Low":"Neutral", val:rsi14, cls:rsi14>60?"good":rsi14<40?"bad":"warn"},
      {group:"momentum", name:"Stochastic %K", chip:Math.round(stoch14)+"", sub:stoch14<20?"Oversold":stoch14>80?"Overbought":"OK", val:stoch14, cls:stoch14<20?"good":stoch14>80?"bad":"warn"},
      {group:"trend", name:"EMA Cross (20/50)", chip:e20>e50?"Bull":"Bear", sub:e20>e50?"20>50 (Bull)":"20<50 (Bear)", val:e20>e50?70:30, cls:e20>e50?"good":"bad"},
      {group:"trend", name:"MACD (12/26/9)", chip:(Math.round(macdLine*100)/100)+"", sub:macdHist>0?"Above 0":"Below 0", val:(Math.tanh(macdHist)*50+50), cls:macdHist>0?"good":"bad"},
      {group:"volatility", name:"ATR% (14)", chip:Math.round(atrPct)+"%", sub:atrPct>6?"High":atrPct<2?"Low":"OK", val:Math.max(0,Math.min(100,(atrPct/10)*100)), cls:atrPct>6?"warn":"good"},
      {group:"volume", name:"CVD (proxy OBV%)", chip:Math.round(obvPct)+"%", sub:obvPct>0?"Net Buy":"Net Sell", val:Math.max(0,Math.min(100,50+obvPct)), cls:obvPct>0?"good":"bad"},
      {group:"trend", name:"ADX(14) proxy", chip:Math.round(adxProxy)+"%", sub:adxProxy>25?"Trending":"OK", val:Math.max(0,Math.min(100,adxProxy)), cls:adxProxy>25?"good":"warn"},
      {group:"volume", name:"Depth/Liquidity", chip:strPct(depthProxy), sub:depthProxy>55?"Above Avg":"Average", val:Math.max(0,Math.min(100,depthProxy)), cls:depthProxy>55?"good":"warn"},
      {group:"trend", name:"Half-Trend", chip:halfTrend, sub:halfTrend, val:halfTrend==="Bullish"?70:30, cls:halfTrend==="Bullish"?"good":"bad"},
      {group:"trend", name:"VWAP Deviation", chip:(Math.round(vwapDev*100)/100)+"%", sub:vwapDev<0?"Below":"Above", val:Math.max(0,Math.min(100,50-vwapDev)), cls:vwapDev<0?"warn":"good"},
      {group:"trend", name:"Up/Down Ratio", chip:(Math.round(lsRatio*100)/100)+"", sub:lsRatio>0.5?"More Ups":"More Downs", val:lsRatio*100, cls:lsRatio>0.5?"good":"bad"},
      {group:"trend", name:"Trend Meter", chip:Math.round(bullP)+"%", sub:trendScore>0?"Bull":"Bear", val:bullP, cls:trendScore>0?"good":"bad"}
    ];
    return {rows, bullP, neutralP, bearP};
    function strPct(x){ return Math.round(x)+'%'; }
  }

  function renderRows(rows){
    const grid=$("#amGrid"); grid.innerHTML="";
    rows.forEach(r=>{
      if (FILTER!=="all" && r.group!==FILTER) return;
      const el=document.createElement("div"); el.className="am-row "+(r.cls||"");
      el.innerHTML=`<div class="name">${r.name}</div>
        <div class="chip">${r.chip}</div>
        <div class="sub">${r.sub}</div>
        <div class="am-bar"><div class="fill" style="width:${Math.max(0,Math.min(100,r.val)).toFixed(0)}%"></div></div>`;
      grid.appendChild(el);
    });
  }

  async function update(){
    $("#amSymbol").textContent = CURRENT.sym;
    $("#amPeriod").textContent = "(" + CURRENT.period + ")";
    try{
      const {h,l,c,v} = await fetchKlines(CURRENT.sym, CURRENT.period);
      const {rows, bullP, neutralP, bearP} = buildRows(h,l,c,v);
      renderRows(rows);
      $("#amBull").textContent = Math.round(bullP)+"%";
      $("#amNeutral").textContent = Math.round(neutralP)+"%";
      $("#amBear").textContent = Math.round(bearP)+"%";
    }catch(e){ /* silently ignore */ }
  }

  // controls
  $("#amControls")?.addEventListener("click",(e)=>{
    const b=e.target.closest(".am-pill"); if(!b) return;
    $$(".am-pill").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    FILTER = b.dataset.filter || "all";
    update();
  });

  // external sync
  window.addEventListener("dxlt:symbol",(e)=>{ CURRENT.sym = e.detail.sym; update(); });
  window.addEventListener("dxlt:period",(e)=>{ CURRENT.period = e.detail.period; update(); });

  // boot
  window.addEventListener("load",()=>{
    try{
      const t=document.querySelector("#chartTitle")?.textContent || "Chart â€” BTC";
      CURRENT.sym=(t.split("â€”")[1]||"BTC").trim();
    }catch(e){ CURRENT.sym="BTC"; }
    CURRENT.period=(document.querySelector("#timeSeg .seg.active")?.dataset.t)||"24h";
    update();
    setInterval(update, 20000);
  });
})();


// --- Binance WS Klines for Alpha Matrix (fast) ---
let wsAlpha=null;
function startAlphaWS(sym,interval){
  try{ if(wsAlpha){wsAlpha.close();} }catch(e){}
  const symbol = sym.toLowerCase()+"usdt";
  wsAlpha = new WebSocket("wss://stream.binance.com:9443/ws/"+symbol+"@kline_"+interval);
  wsAlpha.onmessage = function(ev){
    try{
      const msg=JSON.parse(ev.data);
      const k=msg.k;
      if(!k||!k.c) return;
      const close=parseFloat(k.c), high=parseFloat(k.h), low=parseFloat(k.l), vol=parseFloat(k.v);
      // push into buffer and trigger update
      window._amCache={h:[high],l:[low],c:[close],v:[vol]};
      if(typeof renderFromCache==='function') renderFromCache();
    }catch(e){}
  };
  wsAlpha.onclose=function(){ setTimeout(()=>startAlphaWS(sym,interval),5000); };
}
// override update to use WS
function renderFromCache(){
  const dat=window._amCache; if(!dat) return;
  try{
    const {rows,bullP,neutralP,bearP}=buildRows(dat.h,dat.l,dat.c,dat.v);
    renderRows(rows);
    document.querySelector("#amBull").textContent=Math.round(bullP)+"%";
    document.querySelector("#amNeutral").textContent=Math.round(neutralP)+"%";
    document.querySelector("#amBear").textContent=Math.round(bearP)+"%";
  }catch(e){}
}
window.addEventListener("dxlt:symbol",e=>{startAlphaWS(e.detail.sym, CURRENT.period);});
window.addEventListener("dxlt:period",e=>{startAlphaWS(CURRENT.sym, e.detail.period);});
window.addEventListener("load",()=>{startAlphaWS(CURRENT.sym, CURRENT.period);});

