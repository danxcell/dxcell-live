// safety.js â€” LIVE mode (no request blocking)
(function(){
  try{
    window.SAFE_MODE = false;
    // If an old SAFE service worker exists, unregister it
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(rs=>{
        rs.forEach(r=>{ try{ r.unregister(); }catch(e){} });
      }).catch(()=>{});
    }
  }catch(e){ console.warn('[LIVE_MODE] init error', e); }
})();
