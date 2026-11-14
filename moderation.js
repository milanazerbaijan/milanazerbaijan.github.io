/* ===== İdarə paneli (#/idare) — yalnız admin/owner =====
   reports/<xəbər>/<şərh>/<uid> = { r: insult|spam|other, ts }
   Burada şikayət edilən şərhlər, bloklanmış istifadəçilər və yeni təkliflərin sayı görünür. */
(function(){
  'use strict';
  function start(){
  var MA=window.MA;if(!MA)return;
  var db=MA.db, esc=MA.esc;
  var WHY={insult:'Təhqir / söyüş',spam:'Spam / reklam',other:'Digər'};
  var el=null, refs=[], reports={}, cm={}, cmRefs={}, hid={}, bans={}, titles=null, newSugg=0, loaded=false;

  function st(){return MA.state()}
  function key(i,c){return i+'|'+c}
  function off(){refs.forEach(function(r){r.off()});refs=[];Object.keys(cmRefs).forEach(function(k){cmRefs[k].off()});cmRefs={};cm={};hid={}}
  function on(path,fn){var r=db.ref(path);r.on('value',fn,function(){});refs.push(r);return r}

  function loadTitles(){
    if(titles)return;titles={};
    fetch('data.json',{cache:'no-cache'}).then(function(r){return r.json()}).then(function(d){(d.items||[]).forEach(function(x){if(x&&x.id)titles[x.id]=x.title});paint()}).catch(function(){});
  }

  function mount(){
    var e=document.getElementById('adm');
    if(!e){if(el){off();el=null}return}
    if(e===el)return;
    off();el=e;loaded=false;
    if(!st().mod){paint();return}
    loadTitles();
    on('reports',function(s){
      reports={};
      s.forEach(function(i){i.forEach(function(c){var list=[];c.forEach(function(u){var v=u.val();if(v&&v.r)list.push({u:u.key,r:v.r,ts:v.ts||0})});if(list.length)reports[key(i.key,c.key)]={item:i.key,cid:c.key,list:list}})});
      Object.keys(reports).forEach(function(k){
        if(cmRefs[k])return;var R=reports[k];
        cmRefs[k]=db.ref('comments/'+R.item+'/'+R.cid);
        cmRefs[k].on('value',function(x){cm[k]=x.exists()?x.val():null;if(cm[k]&&cm[k].u)MA.watchUser(cm[k].u);paint()},function(){});
      });
      loaded=true;paint();
    });
    on('hidden',function(s){hid={};s.forEach(function(i){i.forEach(function(c){var v=c.val();if(v&&v.t)hid[key(i.key,c.key)]=v.t})});paint()});
    on('bans',function(s){bans=s.val()||{};Object.keys(bans).forEach(MA.watchUser);paint()});
    on('sugg',function(s){var n=0;s.forEach(function(c){var v=c.val();if(v&&v.st==='new')n++});newSugg=n;paint()});
  }
  document.addEventListener('ma:render',mount);
  document.addEventListener('ma:auth',function(){if(el){var e=el;el=null;off();if(document.getElementById('adm')===e)mount()}});
  document.addEventListener('ma:users',function(){if(el)paint()});

  function repCard(k){
    var R=reports[k], c=cm[k], title=titles&&titles[R.item];
    var cnt={};R.list.forEach(function(x){cnt[x.r]=(cnt[x.r]||0)+1});
    var last=Math.max.apply(null,R.list.map(function(x){return x.ts}));
    var h='<article class="admc" data-k="'+esc(k)+'"><div class="admh"><span class="bdg">'+R.list.length+' şikayət</span>'+
      Object.keys(cnt).map(function(r){return '<span class="admw">'+esc(WHY[r]||r)+(cnt[r]>1?' ×'+cnt[r]:'')+'</span>'}).join('')+
      '<span class="admt">'+esc(MA.ago(last))+'</span></div>';
    h+='<a class="admn" href="#/xeber/'+encodeURIComponent(R.item)+'">'+esc(title||('Xəbər '+R.item))+' ↗</a>';
    if(c===undefined)h+='<p class="cmx">Yüklənir…</p>';
    else if(!c||c.d)h+='<p class="cmx">Bu şərh artıq silinib.</p>';
    else{
      var text=c.h?(hid[k]||''):c.t;
      h+='<div class="admq"><b>'+esc(MA.nameOf(c.u))+'</b>'+(bans[c.u]?' <span class="bdg dark">Bloklanıb</span>':'')+(c.h?' <span class="bdg dark">Gizlədilib</span>':'')+'<p>'+esc(text)+'</p></div>';
    }
    h+='<div class="cma">';
    if(c&&!c.d&&MA.canMod(c.u)){
      h+=(c.h?'<button type="button" class="lnk" data-act="unhide">Göstər</button>':'<button type="button" class="lnk" data-act="hide">Gizlət</button>')+
        '<button type="button" class="lnk dng" data-act="del">Sil</button>';
      if(!MA.roleOf(c.u))h+=bans[c.u]?'<button type="button" class="lnk" data-act="unban">Blokdan çıxar</button>':'<button type="button" class="lnk dng" data-act="ban">Blokla</button>';
    }
    h+='<button type="button" class="lnk acc" data-act="dismiss">'+(c&&!c.d?'Şikayəti rədd et':'Siyahıdan çıxar')+'</button></div>';
    return h+'</article>';
  }
  function paint(){
    if(!el)return;
    if(!st().me){el.innerHTML='<h1>İdarə paneli</h1><div class="empty">Daxil olun.</div>';return}
    if(!st().mod){el.innerHTML='<h1>İdarə paneli</h1><div class="empty">Bu səhifə yalnız adminlər üçündür.</div>';return}
    var keys=Object.keys(reports).sort(function(a,b){
      var A=Math.max.apply(null,reports[a].list.map(function(x){return x.ts})), B=Math.max.apply(null,reports[b].list.map(function(x){return x.ts}));return B-A});
    var h='<h1>İdarə paneli</h1>'+
      '<div class="admsum"><a href="#/idare" class="admbox"><b>'+keys.length+'</b><span>şikayət edilən şərh</span></a>'+
      '<a href="#/teklifler" class="admbox"><b>'+newSugg+'</b><span>yeni təklif</span></a>'+
      '<span class="admbox"><b>'+Object.keys(bans).length+'</b><span>bloklanmış istifadəçi</span></span></div>';
    h+='<h3 class="pdh3">Şikayət edilən şərhlər</h3>';
    if(!loaded)h+='<p class="cmempty">Yüklənir…</p>';
    else if(!keys.length)h+='<p class="cmempty">Şikayət yoxdur. 🎉</p>';
    else h+=keys.map(repCard).join('');
    var bl=Object.keys(bans);
    h+='<h3 class="pdh3">Bloklanmış istifadəçilər</h3>';
    if(!bl.length)h+='<p class="cmempty">Bloklanmış istifadəçi yoxdur.</p>';
    else h+='<div class="admc">'+bl.map(function(u){return '<div class="admban" data-u="'+esc(u)+'"><b>'+esc(MA.nameOf(u))+'</b><button type="button" class="lnk" data-act="unban2">Blokdan çıxar</button></div>'}).join('')+'</div>';
    h+='<p class="admnote">Söyüş və təhqir olan şərhlər, təkliflər və təxəllüslər avtomatik bloklanır. İstifadəçilər digər problemli şərhləri "Şikayət et" ilə bildirir.</p>';
    el.innerHTML=h;
  }

  function fail(){alert('Əməliyyat alınmadı. Səhifəni yeniləyib yenidən cəhd edin.')}
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('button[data-act]');if(!b||!el||!el.contains(b))return;
    var act=b.getAttribute('data-act');
    if(act==='unban2'){var u0=b.closest('[data-u]').getAttribute('data-u');db.ref('bans/'+u0).remove().catch(fail);return}
    var card=b.closest('[data-k]');if(!card)return;
    var k=card.getAttribute('data-k'), R=reports[k], c=cm[k];if(!R)return;
    var base='comments/'+R.item+'/'+R.cid, u={};
    if(act==='dismiss'){db.ref('reports/'+R.item+'/'+R.cid).remove().catch(fail);return}
    if(!c)return;
    if(act==='hide'){u[base+'/t']=null;u[base+'/h']=true;u['hidden/'+R.item+'/'+R.cid]={t:c.t};u['reports/'+R.item+'/'+R.cid]=null;db.ref().update(u).catch(fail);return}
    if(act==='unhide'){var t=hid[k];if(!t)return fail();u[base+'/t']=t;u[base+'/h']=null;u['hidden/'+R.item+'/'+R.cid]=null;db.ref().update(u).catch(fail);return}
    if(act==='del'){
      if(!confirm('Bu şərh silinsin?'))return;
      u[base+'/t']=null;u[base+'/h']=null;u[base+'/d']=true;u['hidden/'+R.item+'/'+R.cid]=null;u['reports/'+R.item+'/'+R.cid]=null;
      db.ref().update(u).catch(fail);return;
    }
    if(act==='ban'){if(!confirm('"'+MA.nameOf(c.u)+'" bloklansın? O, artıq şərh, təklif və proqnoz yaza bilməyəcək.'))return;db.ref('bans/'+c.u).set(true).catch(fail);return}
    if(act==='unban'){db.ref('bans/'+c.u).remove().catch(fail);return}
  });

  mount();
  }
  if(window.MA)start();else document.addEventListener('ma:ready',start);
})();
