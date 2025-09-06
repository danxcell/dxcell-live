
// app.js â€” sidebar + wallet (LIVE)
(function(){
  document.querySelectorAll('.nav-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const openBtn = document.getElementById('wallet-open');
  const modal = document.getElementById('wallet-modal');
  const closeX = document.getElementById('wallet-close');
  const status = document.getElementById('wallet-status');
  const connectBtns = document.querySelectorAll('[data-wallet]');
  let connected = null;

  function open(){ modal.style.display='flex'; }
  function close(){ modal.style.display='none'; }
  function setConnected(name){
    connected = name;
    status.textContent = name ? `Connected: ${name} ` : 'Disconnected';
    close();
  }
  openBtn?.addEventListener('click', open);
  closeX?.addEventListener('click', close);
  modal?.addEventListener('click', (e)=>{ if(e.target===modal) close(); });
  connectBtns.forEach(b=> b.addEventListener('click', ()=> setConnected(b.dataset.wallet)));

  window.DXLT = { safe:false, get wallet(){ return connected; }, disconnect(){ setConnected(null); } };
  window.addEventListener('load', ()=> navigator.serviceWorker?.register('./sw.js').catch(()=>{}));
})();

