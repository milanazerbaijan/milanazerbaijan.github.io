/* ===== Təkliflər və İstəklər =====
   sugg/<id>        { u, k, ti, t, ts, st, r?, rt? }  — hamı oxuyur
   votes/<id>/<uid> = true                            — dəstək (hər kəs 1 dəfə)
   lastS/<uid>      — 5 dəqiqədə 1 təklif;  meta/lastAnonS — anonimlər üçün ümumi 1 dəqiqə limiti
   Giriş etməyənlər Firebase anonim girişi ilə göndərir (adları "Anonim #1234" kimi görünür). */
(function(){
  'use strict';
  function start(){
  var MA=window.MA;if(!MA)return;
  var auth=MA.auth, db=MA.db, TS=MA.TS, esc=MA.esc;
  var KINDS=[['teklif','Təklif'],['istek','İstək'],['xeta','Xəta bildirişi'],['diger','Digər']];
  var KIND={};KINDS.forEach(function(k){KIND[k[0]]=k[1]});
  var STATUS={new:'Yeni',review:'Baxılır',accepted:'Qəbul edildi',rejected:'Rədd edildi'};
  var GAP=300000, PAGE=30, TMAX=80, XMAX=1000, RMAX=500;

  var el=null, sRef=null, vRef=null, list=[], byId={}, votes={}, loaded=false;
  var sort='top', filter='all', limit=PAGE, openMod={}, rDraft={}, stDraft={};
  var form={k:'teklif',ti:'',t:''}, lastS=0, lastRef=null, curUid=null, busy=false;
  function setMsg(t,ok){var m=document.querySelector('#sgForm .msg');if(m){m.textContent=t;m.classList.toggle('ok',!!ok)}var b=document.querySelector('#sgForm button[type="submit"]');if(b)b.disabled=busy}

  function uid(){var u=auth.currentUser;return u?u.uid:null}
  function isAnon(){var u=auth.currentUser;return !!(u&&u.isAnonymous)}
  function st(){return MA.state()}

  /* öz 5 dəqiqə limitini izlə (anonim istifadəçi daxil) */
  auth.onAuthStateChanged(function(u){
    var id=u?u.uid:null;if(id===curUid)return;curUid=id;
    if(lastRef){lastRef.off();lastRef=null}lastS=0;
    if(id){lastRef=db.ref('lastS/'+id);lastRef.on('value',function(s){lastS=+s.val()||0},function(){})}
    paintForm();paintList();
  });

  function ensureUser(){
    if(auth.currentUser)return Promise.resolve(auth.currentUser);
    return auth.signInAnonymously().then(function(r){return r.user});
  }
  function anonErr(e){
    var c=(e&&e.code)||'';
    if(c==='auth/operation-not-allowed'||c==='auth/admin-restricted-operation')return 'Anonim göndərmə hələ aktiv deyil. Zəhmət olmasa Google ilə daxil olun.';
    return 'Əməliyyat alınmadı. Bir az sonra yenidən cəhd edin.';
  }

  /* ---------- quruluş ---------- */
  function mount(){
    var e=document.getElementById('sg');
    if(!e){unmount();return}
    if(e===el)return;
    unmount();el=e;limit=PAGE;openMod={};rDraft={};stDraft={};
    el.innerHTML='<h1>Təkliflər və İstəklər</h1>'+
      '<p class="lede">Sayt və ya azarkeş icması ilə bağlı fikirlərinizi, təkliflərinizi və istəklərinizi yazın. Başqalarının təkliflərini dəstəkləyin — ən çox dəstək alanlar yuxarıda görünür.</p>'+
      '<div id="sgForm"></div><div id="sgAdmin"></div><div class="chips sgbar" id="sgBar" role="toolbar" aria-label="Sıralama və filtr"></div><div id="sgList"><p class="cmempty">Yüklənir…</p></div>';
    sRef=db.ref('sugg').orderByChild('ts').limitToLast(300);
    sRef.on('value',function(s){
      list=[];byId={};
      s.forEach(function(c){var v=c.val();if(v&&typeof v==='object'&&typeof v.u==='string'&&typeof v.ti==='string'){v.id=c.key;list.push(v);byId[c.key]=v;MA.watchUser(v.u)}});
      loaded=true;paintList();
    },function(){var l=document.getElementById('sgList');if(l)l.innerHTML='<p class="cmempty">Təklifləri yükləmək alınmadı.</p>'});
    vRef=db.ref('votes');
    vRef.on('value',function(s){votes=s.val()||{};paintList()},function(){});
    paintForm();
  }
  function unmount(){if(sRef){sRef.off();sRef=null}if(vRef){vRef.off();vRef=null}el=null;loaded=false}
  document.addEventListener('ma:render',mount);
  document.addEventListener('ma:auth',function(){paintForm();paintList()});
  document.addEventListener('ma:users',function(){paintList()});

  /* ---------- forma ---------- */
  function paintForm(){
    var box=document.getElementById('sgForm');if(!box)return;
    var s=st(), who;
    if(s.banned){box.innerHTML='<div class="cmgate"><p>Hesabınız məhdudlaşdırılıb, təklif göndərə bilməzsiniz.</p></div>';return}
    if(s.me&&s.nick)who='<p class="cmas"><b>'+esc(s.nick)+'</b> kimi göndərirsiniz</p>';
    else if(s.me)who='<div class="sgwho"><span>Adınızın görünməsi üçün təxəllüs seçin, əks halda anonim görünəcəksiniz.</span><button type="button" class="lnk acc" data-act="nick">Təxəllüs seç</button></div>';
    else who='<div class="sgwho"><span>Anonim olaraq göndərəcəksiniz'+(isAnon()?' (<b>'+esc(MA.anonName(uid()))+'</b>)':'')+'. Adınızın görünməsini istəyirsinizsə, daxil olun.</span><button type="button" class="btn gbtn sm" data-act="login">'+MA.ICON_G+'Google ilə daxil ol</button></div>';
    var a=document.activeElement, keep=a&&box.contains(a)?a.name:null, pos=keep&&a.selectionStart!=null?a.selectionStart:null;
    box.innerHTML='<form class="sgf" novalidate>'+who+
      '<div class="sgfields"><label class="sgl"><span>Növ</span><select name="k">'+KINDS.map(function(k){return '<option value="'+k[0]+'"'+(form.k===k[0]?' selected':'')+'>'+k[1]+'</option>'}).join('')+'</select></label>'+
      '<label class="sgl grow"><span>Başlıq</span><input name="ti" maxlength="'+TMAX+'" autocomplete="off" placeholder="Qısa başlıq" value="'+esc(form.ti)+'"></label></div>'+
      '<label class="sgl"><span>Mətn</span><textarea name="t" maxlength="'+XMAX+'" rows="4" placeholder="Təklifinizi ətraflı yazın…">'+esc(form.t)+'</textarea></label>'+
      '<div class="cmfb"><span class="cnt">'+form.t.length+'/'+XMAX+'</span><span class="msg" role="status">'+(busy?'Göndərilir…':'')+'</span><button type="submit" class="btn"'+(busy?' disabled':'')+'>Göndər</button></div></form>';
    if(keep){var n=box.querySelector('[name="'+keep+'"]');if(n){n.focus();if(pos!=null)try{n.setSelectionRange(pos,pos)}catch(e){}}}
  }

  /* ---------- siyahı ---------- */
  function voteCount(id){var v=votes[id];return v&&typeof v==='object'?Object.keys(v).length:0}
  function voted(id){var u=uid(),v=votes[id];return !!(u&&v&&v[u])}
  function paintBar(){
    var bar=document.getElementById('sgBar');if(!bar)return;
    var u=uid(), mine=u&&list.some(function(x){return x.u===u});
    var f=[['all','Hamısı'],['new','Yeni'],['review','Baxılır'],['accepted','Qəbul edildi'],['rejected','Rədd edildi']];
    if(mine)f.push(['mine','Mənim təkliflərim']);
    if(filter==='mine'&&!mine)filter='all';
    bar.innerHTML='<button type="button" class="chip" data-sort="top" aria-pressed="'+(sort==='top')+'">Ən çox dəstəklənən</button><button type="button" class="chip" data-sort="new" aria-pressed="'+(sort==='new')+'">Ən yeni</button><span class="sgsep" aria-hidden="true"></span>'+
      f.map(function(x){return '<button type="button" class="chip" data-filter="'+x[0]+'" aria-pressed="'+(filter===x[0])+'">'+x[1]+'</button>'}).join('');
  }
  function paintAdmin(){
    var box=document.getElementById('sgAdmin');if(!box)return;
    if(!st().mod){box.innerHTML='';return}
    var n=list.filter(function(x){return x.st==='new'}).length;
    box.innerHTML='<div class="sgadm"><b>Admin paneli</b><span>'+(n?n+' yeni təklif cavab gözləyir.':'Yeni təklif yoxdur.')+'</span>'+(n&&filter!=='new'?'<button type="button" class="lnk acc" data-filter="new">Yeniləri göstər</button>':'')+'</div>';
  }
  function cardHTML(x){
    var s=st(), u=uid(), mine=u&&x.u===u, n=voteCount(x.id), role=MA.roleOf(x.u);
    var h='<article class="sg" data-s="'+x.id+'"><div class="sgtop"><span class="tag">'+esc(KIND[x.k]||'Digər')+'</span><span class="sgst s-'+esc(x.st)+'">'+esc(STATUS[x.st]||'Yeni')+'</span></div>'+
      '<h3>'+esc(x.ti)+'</h3><p class="sgt">'+esc(x.t)+'</p>'+
      '<div class="meta"><span class="sgau">'+esc(MA.nameOf(x.u))+(role?' <span class="bdg">Admin</span>':'')+(mine?' <span class="bdg dark">Siz</span>':'')+'</span><span>· <time title="'+esc(MA.fullTime(x.ts||0))+' (Bakı vaxtı)">'+esc(MA.ago(x.ts||0))+'</time></span></div>';
    if(x.r)h+='<div class="sgr"><b>Admin cavabı</b><p>'+esc(x.r)+'</p></div>';
    h+='<div class="sgact"><button type="button" class="vote" data-act="vote" aria-pressed="'+voted(x.id)+'" title="Bu təklifi dəstəklə"><span aria-hidden="true">👍</span> Dəstəklə<b>'+(n||'')+'</b></button>';
    if(mine)h+='<button type="button" class="lnk dng" data-act="sdel">Sil</button>';
    if(s.mod&&!mine&&MA.canMod(x.u))h+='<button type="button" class="lnk acc" data-act="mod" aria-expanded="'+!!openMod[x.id]+'">'+(openMod[x.id]?'Bağla':'İdarə et')+'</button>';
    else if(s.mod&&mine)h+='<button type="button" class="lnk acc" data-act="mod" aria-expanded="'+!!openMod[x.id]+'">'+(openMod[x.id]?'Bağla':'Cavab yaz')+'</button>';
    h+='</div>';
    if(s.mod&&openMod[x.id]){
      var cur=stDraft[x.id]||x.st, rd=rDraft[x.id]!=null?rDraft[x.id]:(x.r||'');
      h+='<div class="sgmod" data-s="'+x.id+'"><label class="sgl"><span>Status</span><select data-f="st">'+Object.keys(STATUS).map(function(k){return '<option value="'+k+'"'+(cur===k?' selected':'')+'>'+STATUS[k]+'</option>'}).join('')+'</select></label>'+
        '<label class="sgl"><span>Cavab (istəyə bağlı, '+RMAX+' simvol)</span><textarea data-f="r" maxlength="'+RMAX+'" rows="2" placeholder="Təklif sahibinə və hamıya görünəcək">'+esc(rd)+'</textarea></label>'+
        '<div class="cmfb"><span class="msg" role="status"></span><button type="button" class="lnk dng" data-act="sdel">Təklifi sil</button>'+(!mine&&!role?'<button type="button" class="lnk dng" data-act="sban">Blokla</button>':'')+'<button type="button" class="btn sm" data-act="save">Yadda saxla</button></div></div>';
    }
    return h+'</article>';
  }
  function paintList(){
    var box=document.getElementById('sgList');if(!box||!loaded)return;
    paintBar();paintAdmin();
    var u=uid();
    var arr=list.filter(function(x){
      if(filter==='mine')return x.u===u;
      if(filter!=='all')return x.st===filter;
      return true;
    });
    arr.sort(sort==='top'?function(a,b){return (voteCount(b.id)-voteCount(a.id))||((b.ts||0)-(a.ts||0))}:function(a,b){return (b.ts||0)-(a.ts||0)});
    var a=document.activeElement, mod=a&&box.contains(a)?a.closest('.sgmod'):null, key=mod?mod.getAttribute('data-s')+'|'+a.getAttribute('data-f'):null, pos=key&&a.selectionStart!=null?a.selectionStart:null;
    var h=arr.length?arr.slice(0,limit).map(cardHTML).join(''):'<p class="cmempty">'+(list.length?'Bu filtrə uyğun təklif yoxdur.':'Hələ təklif yoxdur. İlk təklifi siz yazın!')+'</p>';
    if(arr.length>limit)h+='<button type="button" class="more" data-act="smore">Daha çox ('+(arr.length-limit)+')</button>';
    box.innerHTML=h;
    if(key){var p=key.split('|'),n=box.querySelector('.sgmod[data-s="'+p[0]+'"] [data-f="'+p[1]+'"]');if(n){n.focus();if(pos!=null)try{n.setSelectionRange(pos,pos)}catch(e){}}}
  }

  /* ---------- hadisələr ---------- */
  function inSg(t){return el&&el.contains(t)}
  document.addEventListener('input',function(e){
    var t=e.target;if(!inSg(t))return;
    var f=t.closest('.sgf');
    if(f&&t.name){form[t.name]=t.value;if(t.name==='t'){var c=f.querySelector('.cnt');c.textContent=t.value.length+'/'+XMAX;c.classList.toggle('lim',t.value.length>=XMAX)}return}
    var m=t.closest('.sgmod');if(m){var id=m.getAttribute('data-s');if(t.getAttribute('data-f')==='r')rDraft[id]=t.value}
  });
  document.addEventListener('change',function(e){
    var t=e.target;if(!inSg(t))return;
    if(t.closest('.sgf')&&t.name){form[t.name]=t.value;return}
    var m=t.closest('.sgmod');if(m&&t.getAttribute('data-f')==='st')stDraft[m.getAttribute('data-s')]=t.value;
  });
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('button');if(!b||!inSg(b))return;
    if(b.hasAttribute('data-sort')){sort=b.getAttribute('data-sort');limit=PAGE;paintList();return}
    if(b.hasAttribute('data-filter')){filter=b.getAttribute('data-filter');limit=PAGE;paintList();return}
    var act=b.getAttribute('data-act');if(!act)return;
    if(act==='login'){MA.signIn();return}
    if(act==='nick'){MA.openNick();return}
    if(act==='smore'){limit+=PAGE;paintList();return}
    var card=b.closest('[data-s]'), id=card&&card.getAttribute('data-s'), x=id&&byId[id];if(!x)return;
    if(act==='vote'){
      if(st().banned)return;
      b.disabled=true;
      ensureUser().then(function(u){var r=db.ref('votes/'+id+'/'+u.uid);return voted(id)?r.remove():r.set(true)})
        .catch(function(err){alert(anonErr(err))}).then(function(){b.disabled=false});
      return;
    }
    if(act==='mod'){openMod[id]=!openMod[id];paintList();return}
    if(act==='sdel'){
      if(!confirm('Bu təklif silinsin?'))return;
      var u={};u['sugg/'+id]=null;if(st().mod)u['votes/'+id]=null;
      db.ref().update(u).catch(function(){alert('Silmək alınmadı.')});return;
    }
    if(act==='sban'){
      if(!confirm('"'+MA.nameOf(x.u)+'" bloklansın? O, artıq təklif göndərə, dəstək verə və şərh yaza bilməyəcək.'))return;
      db.ref('bans/'+x.u).set(true).then(function(){alert('İstifadəçi bloklandı.')}).catch(function(){alert('Bloklamaq alınmadı.')});return;
    }
    if(act==='save'){
      var m=b.closest('.sgmod'), msg=m.querySelector('.msg'), r=MA.clean(m.querySelector('[data-f="r"]').value), s2=m.querySelector('[data-f="st"]').value;
      if(r.length>RMAX){msg.textContent='Cavab çox uzundur.';return}
      var upd={st:s2};
      if(r){if(r!==x.r){upd.r=r;upd.rt=TS}}else{upd.r=null;upd.rt=null}
      b.disabled=true;
      db.ref('sugg/'+id).update(upd).then(function(){delete rDraft[id];delete stDraft[id];openMod[id]=false;paintList()})
        .catch(function(){b.disabled=false;msg.textContent='Yadda saxlamaq alınmadı.'});
      return;
    }
  });
  document.addEventListener('submit',function(e){
    var f=e.target;if(!f.classList||!f.classList.contains('sgf')||!inSg(f))return;
    e.preventDefault();
    if(busy)return;
    var msg={set textContent(v){setMsg(v)}};
    var k=f.k.value, ti=MA.clean(f.ti.value).replace(/\s+/g,' '), t=MA.clean(f.t.value);
    if(!ti){msg.textContent='Başlıq yazın.';f.ti.focus();return}
    if(!t){msg.textContent='Mətn yazın.';f.t.focus();return}
    if(ti.length>TMAX||t.length>XMAX){msg.textContent='Mətn çox uzundur.';return}
    if(st().banned)return;
    var wait=lastS+GAP-MA.now();
    if(uid()&&wait>0){msg.textContent='Növbəti təklif üçün '+Math.ceil(wait/60000)+' dəqiqə gözləyin.';return}
    busy=true;setMsg('Göndərilir…');
    ensureUser().then(function(u){
      var key=db.ref('sugg').push().key, w={};
      w['sugg/'+key]={u:u.uid,k:KIND[k]?k:'diger',ti:ti,t:t,ts:TS,st:'new'};
      w['lastS/'+u.uid]=TS;
      if(u.isAnonymous)w['meta/lastAnonS']=TS;
      return db.ref().update(w).catch(function(err){err.writeFail=true;err.anon=u.isAnonymous;throw err});
    }).then(function(){
      busy=false;form.ti='';form.t='';lastS=MA.now();
      paintForm();setMsg('Təklifiniz göndərildi. Təşəkkür edirik!',true);
      sort='new';filter='all';paintList();
    }).catch(function(err){
      busy=false;
      if(err&&err.writeFail)setMsg(err.anon?'Hazırda çox anonim təklif göndərilir. Bir dəqiqə sonra yenidən cəhd edin və ya daxil olun.':'Göndərmək alınmadı. 5 dəqiqədə yalnız 1 təklif göndərmək olar.');
      else setMsg(anonErr(err));
    });
  });

  mount();
  }
  if(window.MA)start();else document.addEventListener('ma:ready',start);
})();
