// Usage: <div class="q" data-answer="2" data-why="..."><p>Question</p><label><input type=radio name=q1>Text</label>...</div>
// Immediate feedback on click; shows the reason either way.
document.querySelectorAll('.q').forEach(q=>{
  const ans=+q.dataset.answer, labels=[...q.querySelectorAll('label')];
  const fb=document.createElement('div');fb.className='fb';q.appendChild(fb);
  labels.forEach((l,i)=>l.addEventListener('click',()=>{
    labels.forEach(x=>x.classList.remove('right','wrong'));
    const ok=i===ans;l.classList.add(ok?'right':'wrong');
    fb.textContent=(ok?'Correct. ':'Not quite. Try again. ')+(ok?q.dataset.why:'');
  }));
});
