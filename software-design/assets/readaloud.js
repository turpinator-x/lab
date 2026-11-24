// Adds a "Read aloud" button using the browser's built-in speech. Reads <main> text, skipping quizzes.
(function(){
  if(!('speechSynthesis' in window))return;
  const b=document.createElement('button');b.className='tts';b.textContent='🔊 Read aloud';
  document.querySelector('main').prepend(b);
  b.onclick=()=>{
    if(speechSynthesis.speaking){speechSynthesis.cancel();b.textContent='🔊 Read aloud';return}
    const c=document.querySelector('main').cloneNode(true);
    c.querySelectorAll('.q,.tts,svg,script').forEach(n=>n.remove());
    const u=new SpeechSynthesisUtterance(c.innerText);u.rate=.95;u.onend=()=>b.textContent='🔊 Read aloud';
    speechSynthesis.speak(u);b.textContent='⏹ Stop';
  };
})();
