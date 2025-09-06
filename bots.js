
(function(){
  function openModal(id){
    const el = document.getElementById(id);
    if(el) el.classList.add('show');
  }
  function closeModals(){
    document.querySelectorAll('.bot-modal.show').forEach(m=>m.classList.remove('show'));
  }
  document.addEventListener('click', (e)=>{
    const open = e.target.closest('[data-open]');
    if(open){
      const id = open.getAttribute('data-open');
      openModal(id);
    }
    if(e.target.matches('[data-close]') || e.target.classList.contains('bot-modal')){
      closeModals();
    }
    const to = e.target.closest('[data-scroll]');
    if(to){
      const sel = to.getAttribute('data-scroll');
      const el = document.querySelector(sel);
      if(el) el.scrollIntoView({behavior:'smooth'});
    }
  });
})();
