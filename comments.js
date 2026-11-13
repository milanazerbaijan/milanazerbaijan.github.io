/* ===== Giriş və şərhlər (Firebase Auth + Realtime Database) =====
   Verilənlər:
     profiles/<uid>/n          təxəllüs (hamı oxuya bilər; e-poçt və Google adı HEÇ YERDƏ saxlanmır)
     nicks/<təxəllüs kiçik>    = uid (təxəllüslər təkrarlanmasın deyə)
     roles/<uid>               = "owner" | "admin"  (yalnız Firebase konsolundan verilir)
     comments/<xəbər>/<id>     { u, t, p, ts, e?, h?, d? }
     hidden/<xəbər>/<id>       gizlədilmiş şərhin mətni (yalnız admin oxuya bilər)
     bans/<uid>, last/<uid>    blok və 30 saniyə limiti
   Təhlükəsizliyi database.rules.json-dakı qaydalar təmin edir. */
(function(){
  'use strict';
  if(typeof firebase==='undefined'||!firebase.apps||!firebase.apps.length||!firebase.auth)return;
  var auth,db;
  try{auth=firebase.auth();db=firebase.database()}catch(e){return}
  var TS=firebase.database.ServerValue.TIMESTAMP;
  var MAX=280, GAP=30000, INDENT=4, SHOW=2, PAGE=20;
  var NICK_RE=/^[A-Za-z0-9_]{3,20}$/, RESERVED=/(admin|owner|moderator|support|milanazerbaijan)/i;
  var MONTHS=['yanvar','fevral','mart','aprel','may','iyun','iyul','avqust','sentyabr','oktyabr','noyabr','dekabr'];
  var ICON_USER='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
  var ICON_G='<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

  var me=null, myNick, myRole=null, banned=false, lastAt=0, offset=0, askNick=false;
  var userRefs=[], nicks={}, roles={}, watchedU={}, bans={}, bansRef=null;
  var cur=null; /* {item, el, ref, list, byId, kids, hidRef} */
  var hiddenText={}, open={}, rootLimit=PAGE;
  var draft={main:'', reply:'', edit:''}, replyTo=null, editing=null;
  var acct=document.getElementById('acctBtn');

  db.ref('.info/serverTimeOffset').on('value',function(s){offset=+s.val()||0});
  function now(){return Date.now()+offset}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function idOk(x){return typeof x==='string'&&x.length<=20&&/^[0-9-]+$/.test(x)}
  function cidOk(x){return typeof x==='string'&&/^[-_A-Za-z0-9]{20}$/.test(x)}
  function isMod(){return myRole==='admin'||myRole==='owner'}
  function canMod(c){return myRole==='owner'||(myRole==='admin'&&roles[c.u]!=='owner')}
  function canWrite(){return !!(me&&myNick&&!banned)}
  function baku(ms){return new Date(ms+4*3600*1000)}
  function pad(n){return n<10?'0'+n:''+n}
  function fullTime(ms){var b=baku(ms);return b.getUTCDate()+' '+MONTHS[b.getUTCMonth()]+' '+b.getUTCFullYear()+', '+pad(b.getUTCHours())+':'+pad(b.getUTCMinutes())}
  function ago(ms){
    var s=(now()-ms)/1000;
    if(s<60)return 'indicə';
    if(s<3600)return Math.floor(s/60)+' dəq əvvəl';
    if(s<86400)return Math.floor(s/3600)+' saat əvvəl';
    if(s<7*86400)return Math.floor(s/86400)+' gün əvvəl';
    var b=baku(ms);return b.getUTCDate()+' '+MONTHS[b.getUTCMonth()]+' '+b.getUTCFullYear();
  }
  function nickOf(uid){var n=nicks[uid];return n?n:(n===null?'İstifadəçi':'…')}
  function clean(t){return String(t||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()}

  /* ---------- giriş ---------- */
  function signIn(){
    var p=new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({prompt:'select_account'});
    askNick=true;
    auth.signInWithPopup(p).catch(function(e){
      var c=(e&&e.code)||'';
      if(c==='auth/popup-blocked'||c==='auth/operation-not-supported-in-environment'){auth.signInWithRedirect(p);return}
      askNick=false;
      if(c==='auth/popup-closed-by-user'||c==='auth/cancelled-popup-request')return;
      alert('Daxil olmaq alınmadı'+(c==='auth/unauthorized-domain'?' (bu domenə icazə verilməyib)':'')+'. Bir az sonra yenidən cəhd edin.');
    });
  }
  auth.getRedirectResult().then(function(r){if(r&&r.user)askNick=true}).catch(function(){});

  function detachUser(){userRefs.forEach(function(r){r.off()});userRefs=[];if(bansRef){bansRef.off();bansRef=null;bans={}}}
  function listen(path,fn){var r=db.ref(path);r.on('value',fn,function(){});userRefs.push(r)}

  auth.onAuthStateChanged(function(u){
    detachUser();
    me=u||null; myNick=undefined; myRole=null; banned=false; lastAt=0;
    if(me){
      var uid=me.uid;
      listen('profiles/'+uid+'/n',function(s){
        myNick=s.val()||null; nicks[uid]=myNick; paintAll();
        if(!myNick&&askNick){askNick=false;openNick()}
      });
      listen('roles/'+uid,function(s){
        myRole=s.val()||null; roles[uid]=myRole;
        if(isMod()&&!bansRef){bansRef=db.ref('bans');bansRef.on('value',function(b){bans=b.val()||{};paintList()},function(){})}
        watchHidden(); paintAll();
      });
      listen('bans/'+uid,function(s){banned=s.val()===true;paintCompose();paintList()});
      listen('last/'+uid,function(s){lastAt=+s.val()||0});
    }
    paintAll();
  });

  function paintAcct(){
    if(!acct)return;
    acct.hidden=false;
    if(!me){acct.innerHTML=ICON_USER+'<span>Daxil ol</span>';acct.setAttribute('aria-label','Daxil ol');acct.title='Google ilə daxil ol'}
    else{var n=myNick||'Hesab';acct.innerHTML=ICON_USER+'<span>'+esc(n)+'</span>';acct.setAttribute('aria-label','Hesab: '+n);acct.title='Hesab'}
  }
  if(acct)acct.onclick=function(){me?openAccount():signIn()};

  /* ---------- dialoqlar ---------- */
  var dlg=null;
  function dialog(html){
    if(!dlg){dlg=document.createElement('dialog');dlg.className='cmd';document.body.appendChild(dlg);
      dlg.addEventListener('click',function(e){if(e.target===dlg)dlg.close()})}
    dlg.innerHTML=html;
    if(typeof dlg.showModal==='function'){if(!dlg.open)dlg.showModal()}else dlg.setAttribute('open','');
    return dlg;
  }
  function closeDlg(){if(dlg){if(typeof dlg.close==='function')dlg.close();else dlg.removeAttribute('open')}}

  function openNick(){
    if(!me)return;
    var d=dialog('<form class="dlg" novalidate><h3>'+(myNick?'Təxəllüsü dəyiş':'Təxəllüs seçin')+'</h3>'+
      '<p>Şərhlərdə yalnız təxəllüsünüz görünəcək. Google adınız, şəkliniz və e-poçt ünvanınız heç kimə göstərilmir.</p>'+
      '<input id="nkIn" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="məs. Rossoneri_10" value="'+esc(myNick||'')+'" aria-label="Təxəllüs">'+
      '<p class="hint">3–20 simvol: latın hərfləri (A–Z), rəqəmlər və alt xətt (_).</p><p class="err" role="alert"></p>'+
      '<div class="row"><button type="button" class="lnk" data-x="close">Ləğv et</button><button type="submit" class="btn">Yadda saxla</button></div></form>');
    var f=d.querySelector('form'), inp=d.querySelector('#nkIn'), err=d.querySelector('.err'), btn=d.querySelector('.btn');
    d.querySelector('[data-x="close"]').onclick=closeDlg;
    setTimeout(function(){try{inp.focus()}catch(e){}},30);
    f.onsubmit=function(e){
      e.preventDefault();
      var n=inp.value.trim(), k=n.toLowerCase(), uid=me.uid, old=myNick?myNick.toLowerCase():null;
      if(!NICK_RE.test(n)){err.textContent='Təxəllüs 3–20 simvol olmalıdır: yalnız latın hərfləri, rəqəmlər və _.';return}
      if(RESERVED.test(n)){err.textContent='Bu təxəllüsdən istifadə etmək olmaz.';return}
      if(n===myNick){closeDlg();return}
      btn.disabled=true;err.textContent='';
      db.ref('nicks/'+k).once('value').then(function(s){
        if(s.exists()&&s.val()!==uid)throw {taken:true};
        var u={};u['profiles/'+uid+'/n']=n;u['nicks/'+k]=uid;if(old&&old!==k)u['nicks/'+old]=null;
        return db.ref().update(u);
      }).then(function(){closeDlg()}).catch(function(x){
        btn.disabled=false;
        err.textContent=x&&x.taken?'Bu təxəllüs artıq tutulub. Başqasını seçin.':'Yadda saxlamaq alınmadı. Başqa təxəllüs yoxlayın və ya bir az sonra cəhd edin.';
      });
    };
  }

  function openAccount(){
    var role=myRole==='owner'?'Sahib':(myRole==='admin'?'Admin':'İstifadəçi');
    var d=dialog('<div class="dlg"><h3>Hesab</h3>'+
      '<p>Təxəllüs: <b>'+esc(myNick||'seçilməyib')+'</b><br>Rol: <b>'+role+'</b>'+(banned?'<br><span class="errc">Hesabınız şərh yazmaqdan məhdudlaşdırılıb.</span>':'')+'</p>'+
      '<div class="row"><button type="button" class="lnk" data-x="out">Çıxış</button><button type="button" class="lnk" data-x="nick">'+(myNick?'Təxəllüsü dəyiş':'Təxəllüs seç')+'</button><button type="button" class="btn" data-x="close">Bağla</button></div></div>');
    d.querySelector('[data-x="close"]').onclick=closeDlg;
    d.querySelector('[data-x="nick"]').onclick=openNick;
    d.querySelector('[data-x="out"]').onclick=function(){closeDlg();auth.signOut()};
  }

  /* ---------- şərhlər bölməsi ---------- */
  function watchUser(uid){
    if(!uid||watchedU[uid])return;watchedU[uid]=1;
    db.ref('profiles/'+uid+'/n').on('value',function(s){nicks[uid]=s.val()||null;schedule()},function(){nicks[uid]=null});
    db.ref('roles/'+uid).on('value',function(s){roles[uid]=s.val()||null;schedule()},function(){});
  }
  function watchHidden(){
    if(cur&&cur.hidRef){cur.hidRef.off();cur.hidRef=null}
    hiddenText={};
    if(!cur||!isMod())return;
    cur.hidRef=db.ref('hidden/'+cur.item);
    cur.hidRef.on('value',function(s){hiddenText={};s.forEach(function(c){var v=c.val();if(v&&typeof v.t==='string')hiddenText[c.key]=v.t});schedule()},function(){});
  }

  function unmount(){if(!cur)return;cur.ref.off();if(cur.hidRef)cur.hidRef.off();cur=null}
  function mount(){
    var el=document.getElementById('cmts');
    if(!el){unmount();return}
    var item=el.getAttribute('data-item');
    if(!idOk(item)){el.innerHTML='';return}
    if(cur&&cur.el===el)return;
    unmount();
    open={};rootLimit=PAGE;replyTo=null;editing=null;draft={main:'',reply:'',edit:''};
    el.innerHTML='<h3 class="cmh">Şərhlər <span id="cmCount"></span></h3><div id="cmCompose"></div><div id="cmList"><p class="cmempty">Şərhlər yüklənir…</p></div>';
    cur={item:item,el:el,ref:db.ref('comments/'+item),list:[],byId:{},kids:{},loaded:false,hidRef:null};
    cur.ref.on('value',function(s){
      var list=[];
      s.forEach(function(ch){var v=ch.val();if(v&&typeof v==='object'&&typeof v.u==='string'&&cidOk(ch.key)){v.id=ch.key;list.push(v)}});
      cur.list=list;cur.loaded=true;
      list.forEach(function(c){watchUser(c.u)});
      paintList();
    },function(){var l=document.getElementById('cmList');if(l)l.innerHTML='<p class="cmempty">Şərhləri yükləmək alınmadı.</p>'});
    watchHidden();
    paintCompose();
  }
  document.addEventListener('ma:render',mount);
  window.addEventListener('hashchange',function(){setTimeout(mount,0)});

  function paintAll(){paintAcct();paintCompose();paintList()}

  function formHTML(kind,id,val){
    var ph=kind==='main'?'Fikrinizi yazın…':(kind==='reply'?'Cavabınızı yazın…':'');
    return '<form class="cmf" data-kind="'+kind+'"'+(id?' data-id="'+esc(id)+'"':'')+' novalidate>'+
      '<textarea maxlength="'+MAX+'" rows="'+(kind==='main'?3:2)+'" placeholder="'+ph+'" aria-label="'+(kind==='edit'?'Şərhi redaktə et':'Şərh mətni')+'">'+esc(val||'')+'</textarea>'+
      '<div class="cmfb"><span class="cnt'+((val||'').length>=MAX?' lim':'')+'">'+(val||'').length+'/'+MAX+'</span><span class="msg" role="status"></span>'+
      (kind!=='main'?'<button type="button" class="lnk" data-act="cancel">Ləğv et</button>':'')+
      '<button type="submit" class="btn">'+(kind==='edit'?'Yadda saxla':'Göndər')+'</button></div></form>';
  }

  function paintCompose(){
    var box=document.getElementById('cmCompose');if(!box)return;
    var h;
    if(!me)h='<div class="cmgate"><p>Şərh yazmaq üçün daxil olun.</p><button type="button" class="btn gbtn" data-act="login">'+ICON_G+'Google ilə daxil ol</button></div>';
    else if(myNick===undefined)h='';
    else if(!myNick)h='<div class="cmgate"><p>Şərh yazmaq üçün əvvəlcə təxəllüs seçin.</p><button type="button" class="btn" data-act="nick">Təxəllüs seç</button></div>';
    else if(banned)h='<div class="cmgate"><p>Hesabınız şərh yazmaqdan məhdudlaşdırılıb.</p></div>';
    else h='<p class="cmas"><b>'+esc(myNick)+'</b> kimi yazırsınız</p>'+formHTML('main',null,draft.main);
    var a=document.activeElement, had=a&&box.contains(a)&&a.tagName==='TEXTAREA', pos=had?a.selectionStart:0;
    box.innerHTML=h;
    if(had){var t=box.querySelector('textarea');if(t){t.focus();try{t.setSelectionRange(pos,pos)}catch(e){}}}
  }

  var pending=false;
  function schedule(){if(pending)return;pending=true;setTimeout(function(){pending=false;paintList()},40)}

  function index(){
    var byId={},kids={},roots=[];
    cur.list.forEach(function(c){byId[c.id]=c});
    cur.list.forEach(function(c){if(c.p&&byId[c.p]&&c.p!==c.id){(kids[c.p]=kids[c.p]||[]).push(c)}else roots.push(c)});
    roots.sort(function(a,b){return (b.ts||0)-(a.ts||0)});
    Object.keys(kids).forEach(function(k){kids[k].sort(function(a,b){return (a.ts||0)-(b.ts||0)})});
    cur.byId=byId;cur.kids=kids;
    return roots;
  }
  var visMemo={};
  function visible(c){
    if(visMemo[c.id]!==undefined)return visMemo[c.id];
    visMemo[c.id]=false; /* dövrə qarşı */
    var v=!c.d||(cur.kids[c.id]||[]).some(visible);
    visMemo[c.id]=v;return v;
  }

  function commentHTML(c,depth){
    var mine=me&&c.u===me.uid, par=c.p&&cur.byId[c.p];
    if(c.d)return '<div class="cm del" data-c="'+c.id+'"><p class="cmx">Bu şərh silinib.</p></div>';
    var h='<div class="cm" data-c="'+c.id+'"><div class="cmhd"><b>'+esc(nickOf(c.u))+'</b>';
    if(roles[c.u]==='owner'||roles[c.u]==='admin')h+='<span class="bdg">Admin</span>';
    if(isMod()&&bans[c.u])h+='<span class="bdg dark">Bloklanıb</span>';
    h+='<time title="'+esc(fullTime(c.ts||0))+' (Bakı vaxtı)">'+esc(ago(c.ts||0))+'</time>'+(c.e?'<span>· redaktə edilib</span>':'')+'</div>';
    if(depth>0&&par&&!par.d)h+='<div class="cmto">↳ @'+esc(nickOf(par.u))+'</div>';
    if(c.h){
      if(isMod())h+='<p class="cmt hid"><span class="bdg dark">Gizlədilib</span> '+esc(hiddenText[c.id]||'')+'</p>';
      else h+='<p class="cmx">Bu şərh admin tərəfindən gizlədilib.</p>';
    }else if(editing===c.id&&mine)h+=formHTML('edit',c.id,draft.edit);
    else h+='<p class="cmt">'+esc(c.t)+'</p>';
    var a=[];
    if(!c.h&&editing!==c.id)a.push('<button type="button" class="lnk" data-act="reply">Cavab ver</button>');
    if(mine&&!c.h&&editing!==c.id&&!banned)a.push('<button type="button" class="lnk" data-act="edit">Redaktə et</button>');
    if(mine)a.push('<button type="button" class="lnk dng" data-act="del">Sil</button>');
    if(!mine&&isMod()&&canMod(c)){
      a.push('<button type="button" class="lnk" data-act="'+(c.h?'unhide':'hide')+'">'+(c.h?'Göstər':'Gizlət')+'</button>');
      a.push('<button type="button" class="lnk dng" data-act="del">Sil</button>');
      if(!roles[c.u])a.push('<button type="button" class="lnk dng" data-act="'+(bans[c.u]?'unban':'ban')+'">'+(bans[c.u]?'Blokdan çıxar':'Blokla')+'</button>');
    }
    if(a.length)h+='<div class="cma">'+a.join('')+'</div>';
    if(replyTo===c.id&&canWrite())h+=formHTML('reply',c.id,draft.reply);
    return h+'</div>';
  }
  function nodeHTML(c,depth){
    var ks=(cur.kids[c.id]||[]).filter(visible), h=commentHTML(c,depth);
    if(ks.length){
      var shown=(open[c.id]||ks.length<=SHOW+1)?ks:ks.slice(0,SHOW);
      h+='<div class="cmk'+(depth<INDENT?' ind':'')+'">'+shown.map(function(k){return nodeHTML(k,depth+1)}).join('');
      if(shown.length<ks.length)h+='<button type="button" class="lnk more" data-act="more" data-id="'+c.id+'">Daha '+(ks.length-shown.length)+' cavabı göstər</button>';
      h+='</div>';
    }
    return '<div class="cmn">'+h+'</div>';
  }

  function paintList(){
    var box=document.getElementById('cmList');if(!box||!cur||!cur.loaded)return;
    visMemo={};
    var roots=index().filter(visible);
    var n=cur.list.filter(function(c){return !c.d&&!c.h}).length;
    var cnt=document.getElementById('cmCount');if(cnt)cnt.textContent=n?'('+n+')':'';
    /* yazılan mətni və fokusu qoru */
    var a=document.activeElement, f=a&&box.contains(a)&&a.tagName==='TEXTAREA'?a.closest('form'):null;
    var fk=f?f.getAttribute('data-kind')+'|'+f.getAttribute('data-id'):null, pos=f?a.selectionStart:0;
    var h=roots.length?roots.slice(0,rootLimit).map(function(c){return nodeHTML(c,0)}).join(''):'<p class="cmempty">Hələ şərh yoxdur. İlk şərhi siz yazın!</p>';
    if(roots.length>rootLimit)h+='<button type="button" class="more" data-act="moreroots">Daha çox şərh ('+(roots.length-rootLimit)+')</button>';
    box.innerHTML=h;
    if(fk){var parts=fk.split('|'),t=box.querySelector('form[data-kind="'+parts[0]+'"][data-id="'+parts[1]+'"] textarea');if(t){t.focus();try{t.setSelectionRange(pos,pos)}catch(e){}}}
  }
  setInterval(function(){if(cur&&cur.loaded&&!(document.activeElement&&document.activeElement.tagName==='TEXTAREA'))paintList()},60000);

  /* ---------- hadisələr ---------- */
  function cmOf(el){var d=el.closest('[data-c]');return d&&cur?cur.byId[d.getAttribute('data-c')]:null}
  function base(id){return 'comments/'+cur.item+'/'+id}
  function hasKids(id){return cur.list.some(function(c){return c.p===id})}
  function focusForm(sel){setTimeout(function(){var t=document.querySelector(sel+' textarea');if(t){t.focus();var l=t.value.length;try{t.setSelectionRange(l,l)}catch(e){}}},0)}
  function fail(){alert('Əməliyyat alınmadı. Səhifəni yeniləyib yenidən cəhd edin.')}

  document.addEventListener('input',function(e){
    var t=e.target;if(t.tagName!=='TEXTAREA')return;
    var f=t.closest('.cmf');if(!f)return;
    draft[f.getAttribute('data-kind')]=t.value;
    var c=f.querySelector('.cnt');c.textContent=t.value.length+'/'+MAX;c.classList.toggle('lim',t.value.length>=MAX);
  });

  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-act]');if(!b||!cur||!cur.el.contains(b))return;
    var act=b.getAttribute('data-act'), c=cmOf(b);
    if(act==='login'){signIn();return}
    if(act==='nick'){openNick();return}
    if(act==='moreroots'){rootLimit+=PAGE;paintList();return}
    if(act==='more'){open[b.getAttribute('data-id')]=1;paintList();return}
    if(act==='cancel'){var k=b.closest('.cmf').getAttribute('data-kind');if(k==='reply'){replyTo=null;draft.reply=''}else{editing=null;draft.edit=''}paintList();return}
    if(!c)return;
    if(act==='reply'){
      if(!me){signIn();return}
      if(!myNick){openNick();return}
      if(banned)return;
      if(replyTo!==c.id){replyTo=c.id;draft.reply=''}
      paintList();focusForm('form[data-kind="reply"]');return;
    }
    if(act==='edit'){editing=c.id;draft.edit=c.t||'';paintList();focusForm('form[data-kind="edit"]');return}
    if(act==='del'){
      if(!confirm('Bu şərhi silmək istəyirsiniz?'))return;
      var u={};
      if(hasKids(c.id)){u[base(c.id)+'/t']=null;u[base(c.id)+'/h']=null;u[base(c.id)+'/d']=true}else u[base(c.id)]=null;
      if(c.h&&isMod())u['hidden/'+cur.item+'/'+c.id]=null;
      db.ref().update(u).catch(fail);return;
    }
    if(act==='hide'){
      var h={};h[base(c.id)+'/t']=null;h[base(c.id)+'/h']=true;h['hidden/'+cur.item+'/'+c.id]={t:c.t};
      db.ref().update(h).catch(fail);return;
    }
    if(act==='unhide'){
      db.ref('hidden/'+cur.item+'/'+c.id+'/t').once('value').then(function(s){
        var t=s.val();if(typeof t!=='string'||!t)throw 0;
        var x={};x[base(c.id)+'/t']=t;x[base(c.id)+'/h']=null;x['hidden/'+cur.item+'/'+c.id]=null;
        return db.ref().update(x);
      }).catch(fail);return;
    }
    if(act==='ban'){
      if(!confirm('"'+nickOf(c.u)+'" istifadəçisi bloklansın? O, artıq şərh yaza bilməyəcək.'))return;
      db.ref('bans/'+c.u).set(true).catch(fail);return;
    }
    if(act==='unban'){db.ref('bans/'+c.u).remove().catch(fail);return}
  });

  document.addEventListener('submit',function(e){
    var f=e.target;if(!f.classList||!f.classList.contains('cmf')||!cur)return;
    e.preventDefault();
    var kind=f.getAttribute('data-kind'), id=f.getAttribute('data-id'), ta=f.querySelector('textarea'),
        msg=f.querySelector('.msg'), btn=f.querySelector('button[type="submit"]'), text=clean(ta.value);
    if(!me){signIn();return}
    if(!myNick){openNick();return}
    if(!text){msg.textContent='Mətn boşdur.';return}
    if(text.length>MAX){msg.textContent='Ən çox '+MAX+' simvol yazmaq olar.';return}
    if(kind==='edit'){
      btn.disabled=true;
      db.ref(base(id)).update({t:text,e:TS}).then(function(){editing=null;draft.edit='';paintList()})
        .catch(function(){btn.disabled=false;msg.textContent='Yadda saxlamaq alınmadı.'});
      return;
    }
    var wait=Math.ceil((lastAt+GAP-now())/1000);
    if(wait>0){msg.textContent='Növbəti şərh üçün '+wait+' saniyə gözləyin.';return}
    if(kind==='reply'&&!(cur.byId[id]&&!cur.byId[id].d)){msg.textContent='Bu şərh artıq yoxdur.';return}
    btn.disabled=true;msg.textContent='';
    var key=cur.ref.push().key, u={};
    u[base(key)]={u:me.uid,t:text,p:kind==='reply'?id:'',ts:TS};
    u['last/'+me.uid]=TS;
    db.ref().update(u).then(function(){
      lastAt=now();
      if(kind==='reply'){open[id]=1;replyTo=null;draft.reply='';paintList()}
      else{draft.main='';ta.value='';btn.disabled=false;var c=f.querySelector('.cnt');c.textContent='0/'+MAX;c.classList.remove('lim')}
    }).catch(function(){
      btn.disabled=false;
      msg.textContent=banned?'Hesabınız məhdudlaşdırılıb.':'Göndərmək alınmadı. 30 saniyə gözləyib yenidən cəhd edin.';
    });
  });

  paintAcct();
  mount();
})();
