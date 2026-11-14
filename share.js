/* ===== Paylaşma düymələri =====
   Linklər "?xeber=<id>" şəklindədir (Facebook/WhatsApp "#" hissəsini ata bilir);
   index.html açılanda bunu "#/xeber/<id>" ünvanına çevirir.
   Heç bir kənar skript yüklənmir — yalnız sadə linklər. */
(function(){
  'use strict';
  var SITE=location.origin+location.pathname.replace(/index\.html$/,'');
  var TOUCH=false;try{TOUCH=matchMedia('(pointer:coarse)').matches}catch(e){}
  var NATIVE=!!navigator.share&&TOUCH;
  var IC={
    share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/></svg>',
    wa:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.3z"/></svg>',
    tg:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.9 4.3 18.6 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.2-8.3c.4-.4-.1-.6-.6-.2L6 13.6l-4.9-1.5c-1.1-.3-1.1-1.1.2-1.6L20.5 3c.9-.3 1.7.2 1.4 1.3z"/></svg>',
    fb:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.2a21 21 0 0 0-2.5-.2c-2.5 0-4.2 1.5-4.2 4.3v2.2H7.5v3.3h2.8V22H14v-10.2h2.8l.4-3.3H14z"/></svg>',
    link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>'
  };
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function idOk(x){return typeof x==='string'&&x.length<=20&&/^[0-9-]+$/.test(x)}
  function urlOf(id){return SITE+'?xeber='+encodeURIComponent(id)}
  function links(id,title){
    var u=urlOf(id);
    return {
      wa:'https://wa.me/?text='+encodeURIComponent(title+'\n'+u),
      tg:'https://t.me/share/url?url='+encodeURIComponent(u)+'&text='+encodeURIComponent(title),
      fb:'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(u)
    };
  }
  function copy(text){
    if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(text);
    return new Promise(function(ok,no){
      var t=document.createElement('textarea');t.value=text;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';
      document.body.appendChild(t);t.select();
      try{document.execCommand('copy')?ok():no()}catch(e){no(e)}document.body.removeChild(t);
    });
  }
  function flash(btn,txt){
    var l=btn.querySelector('.l');if(!l)return;var old=l.textContent;l.textContent=txt;btn.classList.add('done');
    setTimeout(function(){l.textContent=old;btn.classList.remove('done')},1800);
  }
  function nativeShare(id,title){return navigator.share({title:title,text:title,url:urlOf(id)})}

  function itemBtns(id,title,withLabels){
    var L=links(id,title), h='';
    if(NATIVE)h+='<button type="button" class="shb main" data-sh="native">'+IC.share+'<span class="l">Paylaş</span></button>';
    else h+='<a class="shb wa" href="'+esc(L.wa)+'" target="_blank" rel="noopener noreferrer" data-sh="wa">'+IC.wa+'<span class="l">WhatsApp</span></a>'+
      '<a class="shb tg" href="'+esc(L.tg)+'" target="_blank" rel="noopener noreferrer" data-sh="tg">'+IC.tg+'<span class="l">Telegram</span></a>'+
      '<a class="shb fb" href="'+esc(L.fb)+'" target="_blank" rel="noopener noreferrer" data-sh="fb">'+IC.fb+'<span class="l">Facebook</span></a>';
    h+='<button type="button" class="shb" data-sh="copy">'+IC.link+'<span class="l">Linki kopyala</span></button>';
    return h;
  }

  /* xəbər səhifəsi: reaksiyaların altında tam sıra */
  function articleRow(){
    var box=document.querySelector('.article .rxbox');if(!box||box.nextElementSibling&&box.nextElementSibling.classList.contains('shr'))return;
    var rx=box.querySelector('.rx[data-rx]'), h1=document.querySelector('.article h1');if(!rx||!h1)return;
    var id=rx.getAttribute('data-rx');if(!idOk(id))return;
    var d=document.createElement('div');d.className='shr';d.setAttribute('data-sid',id);d.setAttribute('data-stitle',h1.textContent);
    d.innerHTML='<h4>Paylaş</h4><div class="shbtns">'+itemBtns(id,h1.textContent)+'</div>';
    box.parentNode.insertBefore(d,box.nextSibling);
  }
  /* kartlar: kiçik paylaş ikonu */
  function cardIcons(){
    Array.prototype.forEach.call(document.querySelectorAll('.rx[data-rx]'),function(rx){
      if(rx.closest('.rxbox')||rx.querySelector('.shc'))return;
      var id=rx.getAttribute('data-rx'), card=rx.closest('.card,.lead'), t=card&&card.querySelector('h2,h3');
      if(!idOk(id)||!t)return;
      var b=document.createElement('button');b.type='button';b.className='shc';b.title='Paylaş';b.setAttribute('aria-label','Paylaş');
      b.setAttribute('aria-haspopup','true');b.setAttribute('data-sid',id);b.setAttribute('data-stitle',t.textContent);
      b.innerHTML=IC.share;rx.appendChild(b);
    });
  }
  /* ===== Telefonda kart reaksiyaları: 👍 👎 + (qalanlar "+" menyusunda) =====
     Böyük ekranda .rxpop "display:contents" olur və hamısı əvvəlki kimi bir sırada görünür. */
  var MORE=['love','fire','wow','sad'];
  function rxCompact(){
    Array.prototype.forEach.call(document.querySelectorAll('.rx[data-rx]'),function(rx){
      if(rx.closest('.rxbox')||rx.querySelector('.rxm'))return;
      var dis=rx.querySelector('.rb[data-r="dislike"]');if(!dis)return;
      var m=document.createElement('button');m.type='button';m.className='rxm';
      m.setAttribute('aria-label','Digər reaksiyalar');m.setAttribute('aria-expanded','false');m.title='Digər reaksiyalar';
      m.innerHTML='<span class="e" aria-hidden="true">+</span><span class="n"></span>';
      var pop=document.createElement('span');pop.className='rxpop';
      MORE.forEach(function(k){var b=rx.querySelector('.rb[data-r="'+k+'"]');if(b)pop.appendChild(b)});
      dis.after(m,pop);rx.classList.add('rxc');
      var sync=function(){rxSync(m,pop)};sync();
      try{new MutationObserver(sync).observe(pop,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-pressed']})}catch(e){}
    });
  }
  /* "+" düyməsi: seçdiyiniz gizli reaksiya varsa onu, yoxdursa "+" və digər reaksiyaların cəmini göstərir */
  function rxSync(m,pop){
    var mine=pop.querySelector('.rb[aria-pressed="true"]'), sum=0;
    Array.prototype.forEach.call(pop.querySelectorAll('.rb .n'),function(n){sum+=parseInt(n.textContent,10)||0});
    m.querySelector('.e').textContent=mine?mine.querySelector('.e').textContent:'+';
    m.querySelector('.n').textContent=sum?sum:'';
    m.setAttribute('aria-pressed',mine?'true':'false');
  }
  function rxClose(except){Array.prototype.forEach.call(document.querySelectorAll('.rx.rx-open'),function(r){if(r!==except){r.classList.remove('rx-open');var m=r.querySelector('.rxm');if(m)m.setAttribute('aria-expanded','false')}})}
  document.addEventListener('click',function(e){
    var m=e.target.closest&&e.target.closest('.rxm');
    if(m){
      e.preventDefault();var rx=m.closest('.rx'), open=!rx.classList.contains('rx-open');
      rxClose(rx);rx.classList.toggle('rx-open',open);m.setAttribute('aria-expanded',open?'true':'false');
      if(open){var pop=rx.querySelector('.rxpop');pop.style.left=Math.max(0,m.offsetLeft-6)+'px'}
      return;
    }
    if(e.target.closest&&e.target.closest('.rxpop .rb')){setTimeout(function(){rxClose(null)},250);return}
    if(!(e.target.closest&&e.target.closest('.rxpop')))rxClose(null);
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape')rxClose(null)});

  function scan(){articleRow();cardIcons()}
  document.addEventListener('ma:render',function(){rxCompact();setTimeout(scan,0)});
  rxCompact();scan();

  /* kart menyusu */
  var menu=null;
  function closeMenu(){if(menu){menu.remove();menu=null}}
  function openMenu(btn){
    closeMenu();
    var id=btn.getAttribute('data-sid'), title=btn.getAttribute('data-stitle');
    menu=document.createElement('div');menu.className='shmenu';menu.setAttribute('role','menu');
    menu.setAttribute('data-sid',id);menu.setAttribute('data-stitle',title);
    menu.innerHTML=itemBtns(id,title);
    document.body.appendChild(menu);
    var r=btn.getBoundingClientRect(), mw=menu.offsetWidth, mh=menu.offsetHeight;
    var left=Math.min(Math.max(8,r.right-mw),document.documentElement.clientWidth-mw-8);
    var top=r.bottom+6+mh>window.innerHeight?r.top-mh-6:r.bottom+6;
    menu.style.left=(left+window.scrollX)+'px';menu.style.top=(top+window.scrollY)+'px';
    var f=menu.querySelector('a,button');if(f)f.focus();
  }

  document.addEventListener('click',function(e){
    var c=e.target.closest&&e.target.closest('.shc');
    if(c){
      e.preventDefault();
      if(NATIVE){nativeShare(c.getAttribute('data-sid'),c.getAttribute('data-stitle')).catch(function(){});return}
      if(menu&&menu.getAttribute('data-sid')===c.getAttribute('data-sid')){closeMenu();return}
      openMenu(c);return;
    }
    var b=e.target.closest&&e.target.closest('.shb');
    if(b){
      var host=b.closest('[data-sid]'), id=host.getAttribute('data-sid'), title=host.getAttribute('data-stitle'), k=b.getAttribute('data-sh');
      if(k==='native'){e.preventDefault();nativeShare(id,title).catch(function(){});return}
      if(k==='copy'){e.preventDefault();copy(urlOf(id)).then(function(){flash(b,'Link kopyalandı ✓');if(menu)setTimeout(closeMenu,900)},function(){prompt('Linki kopyalayın:',urlOf(id))});return}
      if(menu)setTimeout(closeMenu,0);
      return;
    }
    if(menu&&!(e.target.closest&&e.target.closest('.shmenu')))closeMenu();
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeMenu()});
  window.addEventListener('hashchange',closeMenu);
  window.addEventListener('resize',closeMenu);
})();
