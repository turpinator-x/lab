// Usage: <table class="gb"><tr data-concept="..."><td>...<td><input class="pick"><td><input class="avoid"></tr></table>
//        <button id="gb-go">Build glossary</button><pre id="gb-out"></pre>
// Checks each row immediately and builds GLOSSARY.md text in the course's format.
(function(){
  const rows=[...document.querySelectorAll('table.gb tr[data-concept]')];
  const note=r=>r.querySelector('.gbnote');
  function check(r){
    const p=r.querySelector('.pick').value.trim().toLowerCase();
    const a=r.querySelector('.avoid').value.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    let m='';
    if(p&&a.includes(p))m='The picked word is also in the avoid list.';
    else if(p&&!a.length)m='Name at least one word to avoid.';
    note(r).textContent=m;note(r).style.color='var(--bad)';
    return !m&&p;
  }
  rows.forEach(r=>r.querySelectorAll('input').forEach(i=>i.addEventListener('input',()=>check(r))));
  document.getElementById('gb-go').onclick=()=>{
    const out=['# Glossary','','The agreed words for this repo. One word per concept.','','## Terms',''];
    let ok=true;
    rows.forEach(r=>{
      if(!check(r)){ok=false;return}
      out.push('**'+r.querySelector('.pick').value.trim()+'**:',r.dataset.concept,'_Avoid_: '+r.querySelector('.avoid').value.trim(),'');
    });
    document.getElementById('gb-out').textContent=ok?out.join('\n'):'Fill every row first: one pick, at least one word to avoid.';
  };
})();
