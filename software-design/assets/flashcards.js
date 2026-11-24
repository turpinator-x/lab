// Usage: <div class="fc"><p class="fcq">Question</p><div class="fca" hidden>Answer outline</div></div>
// Retrieval practice: say the answer aloud first, reveal, then self-rate. Score is kept in this browser only.
(function(){
  const cards=[...document.querySelectorAll('.fc')];
  const KEY='fc:'+location.pathname;
  let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
  const tally=document.getElementById('fc-tally');
  function show(){if(tally)tally.textContent=Object.values(saved).filter(v=>v==='got').length+' of '+cards.length+' said clearly'}
  cards.forEach((c,i)=>{
    const a=c.querySelector('.fca'),b=document.createElement('button');
    b.textContent='Show the outline (after you say it aloud)';c.appendChild(b);
    const r=document.createElement('div');r.hidden=true;
    r.innerHTML='<button data-v="got">I said it clearly</button> <button data-v="again">Practice again</button>';
    c.appendChild(r);
    b.onclick=()=>{a.hidden=false;r.hidden=false;b.hidden=true};
    r.onclick=e=>{const v=e.target.dataset.v;if(!v)return;saved[i]=v;
      c.dataset.state=v;try{localStorage.setItem(KEY,JSON.stringify(saved))}catch(x){}show()};
    if(saved[i])c.dataset.state=saved[i];
  });
  show();
})();
