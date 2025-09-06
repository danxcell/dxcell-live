(() => {
  const $ = (s) => document.getElementById(s);

  const bidsEl  = $('mdBidsPct');
  const asksEl  = $('mdAsksPct');
  const venueEl = $('mdVenue');
  const gaugeCv = $('mdGauge');
  const sparkCv = $('mdSpark');

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const hist = [];
  const HIST_N = 20;

  function currentSymbol(){
    const chip = document.getElementById('pulseSymbol');
    const t = chip && chip.textContent.trim();
    if (t && t !== '—') return t.toUpperCase();
    if (window.CURRENT?.symbol) return String(window.CURRENT.symbol).toUpperCase();
    return 'BTCUSDT';
  }

  function sizeCanvas(cv, w, h){
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.floor(w*dpr);
    cv.height = Math.floor(h*dpr);
    cv.style.width = w+'px';
    cv.style.height = h+'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return ctx;
  }

  function drawGauge(cv, bidPct){
    const ctx = sizeCanvas(cv, 380, 140);
    const W=380,H=140, cx=W/2,cy=H-10, R=Math.min(W*0.42,H*0.9);
    ctx.lineWidth=10;

    ctx.strokeStyle='rgba(148,163,184,.22)';
    ctx.beginPath(); ctx.arc(cx,cy,R,Math.PI,0,false); ctx.stroke();

    const a = Math.max(0,Math.min(100,bidPct))/100*Math.PI;
    const g = ctx.createLinearGradient(0,0,W,0); g.addColorStop(0,'#16a34a'); g.addColorStop(1,'#22d3ee');
    ctx.strokeStyle=g; ctx.beginPath(); ctx.arc(cx,cy,R,Math.PI,Math.PI+a,false); ctx.stroke();

    const r = ctx.createLinearGradient(W,0,0,0); r.addColorStop(0,'#ef4444'); r.addColorStop(1,'#f59e0b');
    ctx.strokeStyle=r; ctx.beginPath(); ctx.arc(cx,cy,R,Math.PI+a,0,false); ctx.stroke();

    const ang=(bidPct/100)*Math.PI - Math.PI/2;
    const nx=cx+Math.cos(Math.PI+ang)*(R-6), ny=cy+Math.sin(Math.PI+ang)*(R-6);
    ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(nx,ny); ctx.stroke();
    ctx.fillStyle='#94a3b8'; ctx.beginPath(); ctx.arc(cx,cy,4,0,2*Math.PI); ctx.fill();
  }

  function drawSpark(cv, arr){
    const W=Math.max(cv.clientWidth||540, 320), H=44;
    const ctx=sizeCanvas(cv,W,H); ctx.clearRect(0,0,W,H);
    if(!arr.length) return;
    const step=W/Math.max(1,arr.length-1);

    ctx.strokeStyle='rgba(148,163,184,.12)';
    ctx.beginPath(); ctx.moveTo(0,H-1.5); ctx.lineTo(W,H-1.5); ctx.stroke();

    ctx.strokeStyle='#22d3ee'; ctx.lineWidth=2; ctx.beginPath();
    for(let i=0;i<arr.length;i++){
      const x=i*step, y=H-(arr[i]/100)*(H-4)-2;
      i?ctx.lineTo(x,y):ctx.moveTo(x,y);
    }
    ctx.stroke();
    ctx.strokeStyle='rgba(34,211,238,.35)'; ctx.lineWidth=6; ctx.stroke();
  }

  async function tick(){
    try{
      const s=currentSymbol();
      const url=`/api/depth?symbol=${encodeURIComponent(s)}&limit=50&levels=25&venue=smart&tz=${encodeURIComponent(tz)}&cb=${Date.now()}`;
      const r=await fetch(url,{cache:'no-store'});
      const j=await r.json();

      const bid=Number.isFinite(j.bidPct)?j.bidPct:0;
      const ask=Number.isFinite(j.askPct)?j.askPct:0;

      if(bidsEl) bidsEl.textContent=`${bid.toFixed(0)}%`;
      if(asksEl) asksEl.textContent=`${ask.toFixed(0)}%`;
      if(venueEl) venueEl.textContent=`• ${s} • source: ${j.venue||'—'} • ${tz}`;

      if(gaugeCv) drawGauge(gaugeCv,bid);
      hist.push(bid); while(hist.length>HIST_N) hist.shift();
      if(sparkCv) drawSpark(sparkCv,hist);
    }catch(e){
      console.warn('depth wire error',e);
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    tick();
    setInterval(tick,15000);
  });

  const chip=document.getElementById('pulseSymbol');
  if(chip && 'MutationObserver' in window){
    const mo=new MutationObserver(()=>tick());
    mo.observe(chip,{childList:true,characterData:true,subtree:true});
  }
  window.addEventListener('dxlt:set-symbol', tick);
})();
