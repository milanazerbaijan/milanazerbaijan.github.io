/* ===== Proqnoz oyunu =====
   matches/<mid>     { opp, home, ko, comp, venue?, short?, c1?, c2?, res?:{h,a} } — yalnız admin yazır
                     (admin səhifəni açanda "Növbəti oyunlar"dan avtomatik əlavə olunur)
   preds/<mid>/<uid> { h, a, ts } — oyun başlayana qədər; başqalarınınkı oyun başlayanda açılır
   h = soldakı (ev sahibi), a = sağdakı (qonaq) komandanın qolları.
   Xallar: dəqiq hesab 3, nəticə düzgün 1, səhv 0. */
(function(){
  'use strict';
  function start(){
  var MA=window.MA;if(!MA)return;
  var db=MA.db, auth=MA.auth, TS=MA.TS, esc=MA.esc;
  var MONTHS=['yanvar','fevral','mart','aprel','may','iyun','iyul','avqust','sentyabr','oktyabr','noyabr','dekabr'];
  var el=null, mRef=null, matches={}, loaded=false, fixtures=null, synced=false;
  var preds={}, predRefs={}, mine={}, mineRefs={}, mineUid=null;
  var draft={}, openCard={}, board='season', resOpen={}, resDraft={}, flash={};

  function st(){return MA.state()}
  function now(){return MA.now()}
  function baku(ms){return new Date(ms+4*3600*1000)}
  function pad(n){return n<10?'0'+n:''+n}
  function when(ms){var b=baku(ms);return b.getUTCDate()+' '+MONTHS[b.getUTCMonth()]+', '+pad(b.getUTCHours())+':'+pad(b.getUTCMinutes())}
  function day(ms){var b=baku(ms);return b.getUTCDate()+' '+MONTHS[b.getUTCMonth()]}
  function left(ms){
    var s=Math.max(0,Math.floor((ms-now())/1000)), d=Math.floor(s/86400), h=Math.floor(s%86400/3600), m=Math.floor(s%3600/60);
    if(d)return d+' gün '+h+' saat';if(h)return h+' saat '+m+' dəq';return Math.max(1,m)+' dəq';
  }
  function midOf(f){
    var t=Date.parse(f.utc);if(isNaN(t))return null;
    var slug=String(f.opp||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
    if(!slug)return null;
    return new Date(t).toISOString().slice(0,10).replace(/-/g,'')+'-'+slug;
  }
  function seasonStart(){var d=new Date(now()), y=d.getUTCFullYear();if(d.getUTCMonth()<6)y--;return Date.UTC(y,6,1)}
  function seasonLabel(){var y=new Date(seasonStart()).getUTCFullYear();return 'Mövsüm '+y+'/'+String(y+1).slice(2)}
  function sameMonth(ms){var a=baku(ms),b=baku(now());return a.getUTCFullYear()===b.getUTCFullYear()&&a.getUTCMonth()===b.getUTCMonth()}
  function sign(x){return x>0?1:(x<0?-1:0)}
  function pts(p,r){if(!p||!r)return null;if(p.h===r.h&&p.a===r.a)return 3;return sign(p.h-p.a)===sign(r.h-r.a)?1:0}
  function teams(m){var mil={name:'Milan',short:'MIL',c1:'#c8102e',c2:'#ffffff'}, opp={name:m.opp,short:m.short||m.opp.slice(0,3).toUpperCase(),c1:m.c1||'#555',c2:m.c2||'#fff'};return m.home?[mil,opp]:[opp,mil]}
  function crest(t,big){
    var L=window.LOGOS||{}, id=Object.prototype.hasOwnProperty.call(L,t.name)?L[t.name]:null, px=big?52:30;
    var fb='<span class="pdc'+(big?' big':'')+'" style="background:'+esc(t.c1)+';color:'+esc(t.c2)+'">'+esc(t.short)+'</span>';
    if(!/^[0-9]+$/.test(String(id)))return fb;
    return '<img class="pdl'+(big?' big':'')+'" src="https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/'+id+'.png&h='+(px*2)+'&w='+(px*2)+'" alt="" width="'+px+'" height="'+px+'" loading="lazy" referrerpolicy="no-referrer" data-fb="'+esc(fb)+'">';
  }
  document.addEventListener('error',function(e){var im=e.target;if(im&&im.tagName==='IMG'&&im.hasAttribute('data-fb')){var w=document.createElement('span');w.innerHTML=im.getAttribute('data-fb');im.replaceWith(w.firstChild)}},true);

  /* ---------- məlumat ---------- */
  function loadFixtures(){
    if(fixtures)return;fixtures=[];
    fetch('data.json',{cache:'no-cache'}).then(function(r){return r.json()}).then(function(d){fixtures=(d.fixtures&&d.fixtures.items)||[];sync()}).catch(function(){});
  }
  /* admin səhifəni açanda növbəti oyunlar bazaya əlavə olunur (vaxt dəyişibsə yenilənir) */
  function sync(){
    if(synced||!loaded||!fixtures||!fixtures.length||!st().mod)return;
    synced=true;
    var u={}, t=now();
    fixtures.forEach(function(f){
      var mid=midOf(f), ko=Date.parse(f.utc);if(!mid||!(ko>t))return;
      var m=matches[mid];
      if(!m){
        var o={opp:String(f.opp).slice(0,40),home:!!f.home,ko:ko,comp:String(f.comp||'').slice(0,80)};
        if(f.venue)o.venue=String(f.venue).slice(0,80);
        if(f.short)o.short=String(f.short).slice(0,5);
        if(/^#[0-9a-fA-F]{3,8}$/.test(f.c1||''))o.c1=f.c1;
        if(/^#[0-9a-fA-F]{3,8}$/.test(f.c2||''))o.c2=f.c2;
        u['matches/'+mid]=o;
      }else if(!m.res&&m.ko!==ko)u['matches/'+mid+'/ko']=ko;
    });
    if(Object.keys(u).length)db.ref().update(u).catch(function(){synced=false});
  }

  function watchPreds(){
    var t=now(), s=seasonStart(), uid=st().me?st().me.uid:null;
    Object.keys(matches).forEach(function(mid){
      var m=matches[mid];
      if(m.ko<=t&&m.ko>=s-86400000&&!predRefs[mid]){
        predRefs[mid]=db.ref('preds/'+mid);
        predRefs[mid].on('value',function(x){var o={};x.forEach(function(c){var v=c.val();if(v&&typeof v.h==='number'&&typeof v.a==='number'){o[c.key]={h:v.h,a:v.a};MA.watchUser(c.key)}});preds[mid]=o;schedule()},function(){});
      }
    });
    if(uid!==mineUid){Object.keys(mineRefs).forEach(function(k){mineRefs[k].off()});mineRefs={};mine={};mineUid=uid}
    if(uid)Object.keys(matches).forEach(function(mid){
      if(matches[mid].ko>t&&!mineRefs[mid]){
        mineRefs[mid]=db.ref('preds/'+mid+'/'+uid);
        mineRefs[mid].on('value',function(x){var v=x.val();mine[mid]=v&&typeof v.h==='number'?{h:v.h,a:v.a}:null;schedule()},function(){});
      }
    });
  }
  function myPred(mid){var u=st().me;if(!u)return null;if(preds[mid]&&preds[mid][u.uid])return preds[mid][u.uid];return mine[mid]||null}

  function mount(){
    var e=document.getElementById('pd');
    if(!e){unmount();return}
    if(e===el)return;
    unmount();el=e;
    el.innerHTML='<h1>Proqnoz oyunu</h1><p class="lede">Hər oyundan əvvəl hesabı təxmin edin, xal toplayın və azarkeşlər arasında birinci olun!</p><div class="pdgrid"><div id="pdMain"><p class="cmempty">Yüklənir…</p></div><aside id="pdSide"></aside></div>';
    mRef=db.ref('matches');
    mRef.on('value',function(s){
      var o={};s.forEach(function(c){var v=c.val();if(v&&typeof v.ko==='number'&&typeof v.opp==='string'){v.id=c.key;o[c.key]=v}});
      matches=o;loaded=true;watchPreds();sync();paint();
    },function(){var m=document.getElementById('pdMain');if(m)m.innerHTML='<p class="cmempty">Oyunları yükləmək alınmadı.</p>'});
    loadFixtures();
  }
  function unmount(){if(mRef){mRef.off();mRef=null}el=null}
  document.addEventListener('ma:render',mount);
  document.addEventListener('ma:auth',function(){if(!el)return;sync();watchPreds();paint()});
  document.addEventListener('ma:users',function(){if(el)schedule()});
  var pend=false;function schedule(){if(pend)return;pend=true;setTimeout(function(){pend=false;paint()},40)}
  setInterval(function(){if(el&&loaded){var a=document.activeElement;if(!(a&&el.contains(a)&&a.tagName==='INPUT')){watchPreds();paint()}}},30000);

  /* ---------- görünüş ---------- */
  function gate(){
    var s=st();
    if(!s.me)return '<div class="pdgate"><span>Proqnoz vermək üçün daxil olun.</span><button type="button" class="btn gbtn sm" data-act="login">'+MA.ICON_G+'Google ilə daxil ol</button></div>';
    if(s.nick===undefined)return '';
    if(!s.nick)return '<div class="pdgate"><span>Proqnoz vermək üçün təxəllüs seçin.</span><button type="button" class="btn sm" data-act="nick">Təxəllüs seç</button></div>';
    if(s.banned)return '<div class="pdgate"><span>Hesabınız məhdudlaşdırılıb.</span></div>';
    return null;
  }
  function upcomingCard(m,first){
    var T=teams(m), my=myPred(m.id), open=first||openCard[m.id], g=gate(), v=draft[m.id]||my||{h:0,a:0}, s=st();
    if(!open)return '<article class="pdm mini" data-m="'+esc(m.id)+'"><div class="pdmini">'+crest(T[0])+crest(T[1])+'<div class="pdtx"><b>'+esc(T[0].name)+' – '+esc(T[1].name)+'</b><small>'+esc(m.comp.split(',')[0])+' · '+esc(when(m.ko))+'</small></div></div>'+
      (my?'<span class="pdmy">✓ '+my.h+' : '+my.a+'</span>':'')+'<button type="button" class="btn sm ghost" data-act="open">'+(my?'Dəyiş':'Proqnoz ver')+'</button>'+
      (s.mod?'<div class="pdadm"><button type="button" class="lnk dng" data-act="mdel">Oyunu sil</button></div>':'')+'</article>';
    var h='<article class="pdm" data-m="'+esc(m.id)+'"><div class="pdhd"><span>'+esc(m.comp)+(m.venue?' · '+esc(m.venue):'')+'</span>'+
      (my?'<span class="pdok">✓ Proqnoz verildi</span>':'<span class="pdopen">Proqnoz açıqdır</span>')+'</div>';
    h+='<div class="pdrow"><div class="pdt">'+crest(T[0],true)+'<b>'+esc(T[0].name)+'</b></div>';
    if(open&&!g){
      h+='<div class="pdsc">'+['h','a'].map(function(k,i){return (i?'<span class="pdcol">:</span>':'')+'<div class="pdst"><button type="button" data-act="inc" data-k="'+k+'" aria-label="'+esc(T[i].name)+' +1">+</button><b aria-live="polite">'+v[k]+'</b><button type="button" data-act="dec" data-k="'+k+'" aria-label="'+esc(T[i].name)+' −1">−</button></div>'}).join('')+'</div>';
    }else if(my){
      h+='<div class="pdsc"><div class="pdmine"><small>Sizin proqnoz</small><b>'+my.h+' : '+my.a+'</b></div></div>';
    }else h+='<div class="pdsc"><span class="pdvs">'+(open?'– : –':'VS')+'</span></div>';
    h+='<div class="pdt">'+crest(T[1],true)+'<b>'+esc(T[1].name)+'</b></div></div>';
    h+='<p class="pdcd">'+esc(when(m.ko))+' · Proqnoz bağlanır: <b>'+esc(left(m.ko))+'</b></p>';
    if(open){
      if(g)h+=g;
      else{
        var changed=!my||my.h!==v.h||my.a!==v.a;
        h+='<button type="button" class="btn pdsave" data-act="save"'+(changed?'':' disabled')+'>'+(my?(changed?'Proqnozu yenilə':'Yadda saxlanılıb'):'Proqnozu yadda saxla')+'</button>';
        h+='<p class="pdmsg'+(flash[m.id]&&flash[m.id].ok?' ok':'')+'" role="status">'+(flash[m.id]?esc(flash[m.id].t):(my?'✓ Proqnozunuz: '+my.h+' : '+my.a+' — oyun başlayana qədər dəyişə bilərsiniz':''))+'</p>';
      }
      if(!first)h+='<button type="button" class="lnk pdtgl" data-act="close">Bağla</button>';
    }
    if(s.mod)h+='<div class="pdadm"><button type="button" class="lnk dng" data-act="mdel">Oyunu sil</button></div>';
    return h+'</article>';
  }
  function resEditor(m){
    var T=teams(m), r=resDraft[m.id]||m.res||{h:'',a:''};
    return '<div class="pdres"><span>Hesab:</span><label><span class="sr">'+esc(T[0].name)+'</span><input type="number" inputmode="numeric" min="0" max="30" data-r="h" value="'+r.h+'"></label><b>:</b><label><span class="sr">'+esc(T[1].name)+'</span><input type="number" inputmode="numeric" min="0" max="30" data-r="a" value="'+r.a+'"></label><button type="button" class="btn sm" data-act="rsave">Yadda saxla</button>'+(m.res?'<button type="button" class="lnk" data-act="rclose">Ləğv et</button>':'')+'</div>';
  }
  function pastRow(m){
    var T=teams(m), my=myPred(m.id), p=pts(my,m.res), n=preds[m.id]?Object.keys(preds[m.id]).length:0, s=st();
    var h='<div class="pdp" data-m="'+esc(m.id)+'"><div class="pdpt"><b>'+esc(T[0].name)+(m.res?'<span class="pdr">'+m.res.h+' – '+m.res.a+'</span>':' – ')+esc(T[1].name)+'</b>'+
      '<span>'+esc(m.comp.split(',')[0])+' · '+esc(day(m.ko))+' · '+n+' proqnoz'+(m.res?'':' · <i>nəticə gözlənilir</i>')+'</span></div>';
    h+='<div class="pdpm">'+(my?'<small>Sizin</small><b>'+my.h+' : '+my.a+'</b>':'<small>Proqnoz</small><b>—</b>')+'</div>';
    h+='<div class="pdpts '+(p===3?'p3':p===1?'p1':'p0')+'">'+(p==null?'·':(p?'+'+p:'0'))+'</div></div>';
    if(s.mod){
      if(!m.res||resOpen[m.id])h+='<div class="pdp2" data-m="'+esc(m.id)+'">'+resEditor(m)+'</div>';
      else h+='<div class="pdp2" data-m="'+esc(m.id)+'"><button type="button" class="lnk" data-act="ropen">Hesabı düzəlt</button><button type="button" class="lnk dng" data-act="mdel">Oyunu sil</button></div>';
    }
    return h;
  }
  function crowd(m){
    var P=preds[m.id];if(!P)return '';
    var arr=Object.keys(P).map(function(k){return P[k]});if(arr.length<1)return '';
    var w=0,d=0,l=0,sc={},best=null,ex=0,T=teams(m);
    arr.forEach(function(p){var g=sign(p.h-p.a);if(g>0)w++;else if(g<0)l++;else d++;var k=p.h+' : '+p.a;sc[k]=(sc[k]||0)+1;if(!best||sc[k]>sc[best])best=k;if(m.res&&p.h===m.res.h&&p.a===m.res.a)ex++});
    var n=arr.length, pc=function(x){return Math.round(x*100/n)};
    var c0=T[0].name==='Milan'?'var(--red)':'#111', c2=T[1].name==='Milan'?'var(--red)':'#111';
    return '<div class="pdm pdcrowd"><div class="pdhd"><span>'+esc(T[0].name)+' – '+esc(T[1].name)+' · azarkeşlərin proqnozları</span><span>'+n+' nəfər</span></div>'+
      '<div class="pdbar"><i style="width:'+pc(w)+'%;background:'+c0+'"></i><i style="width:'+pc(d)+'%;background:#9aa0a6"></i><i style="width:'+pc(l)+'%;background:'+c2+'"></i></div>'+
      '<div class="pdleg"><span>'+esc(T[0].name)+' '+pc(w)+'%</span><span>Heç-heçə '+pc(d)+'%</span><span>'+esc(T[1].name)+' '+pc(l)+'%</span></div>'+
      '<p class="pdsub">Ən çox verilən hesab: <b>'+esc(best)+'</b>'+(m.res?' · Dəqiq tapan: <b>'+ex+' nəfər</b>':'')+'</p></div>';
  }
  function boardHTML(){
    var t=now(), s=seasonStart(), tot={}, exact={}, played={};
    Object.keys(matches).forEach(function(mid){
      var m=matches[mid];if(!m.res||m.ko>t||m.ko<s)return;if(board==='month'&&!sameMonth(m.ko))return;
      var P=preds[mid]||{};Object.keys(P).forEach(function(u){var p=pts(P[u],m.res);tot[u]=(tot[u]||0)+p;exact[u]=(exact[u]||0)+(p===3?1:0);played[u]=(played[u]||0)+1});
    });
    var rows=Object.keys(tot).sort(function(a,b){return (tot[b]-tot[a])||(exact[b]-exact[a])||(played[a]-played[b])||MA.nameOf(a).localeCompare(MA.nameOf(b))});
    var me=st().me, myI=me?rows.indexOf(me.uid):-1, medal=['🥇','🥈','🥉'];
    var row=function(u,i){return '<div class="pdlr'+(me&&u===me.uid?' me':'')+'"><span class="rk">'+(i<3?medal[i]:i+1)+'</span><span class="nm">'+esc(MA.nameOf(u))+(me&&u===me.uid?' (siz)':'')+'</span><span class="ex">'+exact[u]+' dəqiq</span><span class="sc">'+tot[u]+'</span></div>'};
    var h='<div class="pdm pdlb"><h4>🏆 Ən yaxşı proqnozçular</h4><p class="pdsub">'+(board==='month'?'Bu ay':esc(seasonLabel()))+'</p>'+
      '<div class="pdseg" role="tablist"><button type="button" role="tab" data-board="season" aria-selected="'+(board==='season')+'">Mövsüm</button><button type="button" role="tab" data-board="month" aria-selected="'+(board==='month')+'">Bu ay</button></div>';
    if(!rows.length)h+='<p class="cmempty">Hələ xal yoxdur. İlk nəticədən sonra burada görünəcək.</p>';
    else{h+=rows.slice(0,10).map(row).join('');if(myI>=10)h+=row(me.uid,myI)}
    return h+'</div>';
  }
  function rulesHTML(){
    return '<div class="pdm pdrules"><b>Xallar</b><p>🎯 Dəqiq hesab — <b>3 xal</b><br>✅ Nəticə düzgün (qələbə / heç-heçə / məğlubiyyət) — <b>1 xal</b><br>❌ Səhv — 0 xal</p><p>Proqnoz oyun başlayana qədər verilir və dəyişdirilə bilər. Başqalarının proqnozları oyun başlayanda açılır.</p></div>';
  }
  function paint(){
    if(!el||!loaded)return;
    var main=document.getElementById('pdMain'), side=document.getElementById('pdSide');if(!main||!side)return;
    var t=now(), all=Object.keys(matches).map(function(k){return matches[k]});
    var up=all.filter(function(m){return m.ko>t}).sort(function(a,b){return a.ko-b.ko}).slice(0,6);
    var past=all.filter(function(m){return m.ko<=t&&m.ko>=seasonStart()}).sort(function(a,b){return b.ko-a.ko});
    var a=document.activeElement, key=a&&main.contains(a)&&a.tagName==='INPUT'&&a.closest('[data-m]')?a.closest('[data-m]').getAttribute('data-m')+'|'+a.getAttribute('data-r'):null;
    var h='';
    if(!up.length)h+='<div class="pdm"><p class="cmempty" style="text-align:center">Hazırda proqnoz üçün açıq oyun yoxdur.'+(st().mod?' Növbəti oyunlar "Növbəti oyunlar" siyahısından avtomatik əlavə olunur.':'')+'</p></div>';
    else h+=up.map(function(m,i){return upcomingCard(m,i===0)}).join('');
    if(past.length){
      var latest=past.filter(function(m){return preds[m.id]&&Object.keys(preds[m.id]).length})[0];
      h+='<h3 class="pdh3">Keçmiş oyunlar</h3><div class="pdm pdpast">'+past.slice(0,15).map(pastRow).join('')+'</div>';
      if(latest)h+=crowd(latest);
    }
    main.innerHTML=h;
    side.innerHTML=boardHTML()+rulesHTML();
    if(key){var p=key.split('|'),n=main.querySelector('[data-m="'+p[0]+'"] input[data-r="'+p[1]+'"]');if(n)n.focus()}
  }

  /* ---------- hadisələr ---------- */
  function inPd(x){return el&&el.contains(x)}
  document.addEventListener('input',function(e){
    var t=e.target;if(!inPd(t)||!t.hasAttribute('data-r'))return;
    var box=t.closest('[data-m]');if(!box)return;var mid=box.getAttribute('data-m');resDraft[mid]=resDraft[mid]||{h:'',a:''};resDraft[mid][t.getAttribute('data-r')]=t.value;
  });
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('button');if(!b||!inPd(b))return;
    if(b.hasAttribute('data-board')){board=b.getAttribute('data-board');paint();return}
    var act=b.getAttribute('data-act');if(!act)return;
    if(act==='login'){MA.signIn();return}
    if(act==='nick'){MA.openNick();return}
    var box=b.closest('[data-m]'), mid=box&&box.getAttribute('data-m'), m=mid&&matches[mid];if(!m)return;
    if(act==='open'){openCard[mid]=1;paint();return}
    if(act==='close'){openCard[mid]=0;delete draft[mid];paint();return}
    if(act==='inc'||act==='dec'){
      var v=draft[mid]||myPred(mid)||{h:0,a:0};v={h:v.h,a:v.a};var k=b.getAttribute('data-k');
      v[k]=Math.max(0,Math.min(20,v[k]+(act==='inc'?1:-1)));draft[mid]=v;delete flash[mid];paint();return;
    }
    if(act==='save'){
      var u=st().me;if(!u||m.ko<=now())return;
      var d=draft[mid]||myPred(mid)||{h:0,a:0};b.disabled=true;
      db.ref('preds/'+mid+'/'+u.uid).set({h:d.h,a:d.a,ts:TS}).then(function(){
        delete draft[mid];mine[mid]={h:d.h,a:d.a};flash[mid]={t:'✓ Yadda saxlanıldı: '+d.h+' : '+d.a+' — oyun başlayana qədər dəyişə bilərsiniz',ok:1};paint();
        setTimeout(function(){delete flash[mid];schedule()},4000);
      }).catch(function(){flash[mid]={t:m.ko<=now()?'Proqnoz artıq bağlanıb.':'Yadda saxlamaq alınmadı. Yenidən cəhd edin.'};paint()});
      return;
    }
    if(act==='ropen'){resOpen[mid]=1;paint();return}
    if(act==='rclose'){resOpen[mid]=0;delete resDraft[mid];paint();return}
    if(act==='rsave'){
      var ed=b.closest('.pdres'), hh=parseInt(ed.querySelector('[data-r="h"]').value,10), aa=parseInt(ed.querySelector('[data-r="a"]').value,10);
      if(!(hh>=0&&hh<=30&&aa>=0&&aa<=30)){alert('Hesabı düzgün yazın (0–30).');return}
      b.disabled=true;
      db.ref('matches/'+mid+'/res').set({h:hh,a:aa}).then(function(){resOpen[mid]=0;delete resDraft[mid];paint()}).catch(function(){b.disabled=false;alert('Yadda saxlamaq alınmadı.')});
      return;
    }
    if(act==='mdel'){
      var T=teams(m);if(!confirm(T[0].name+' – '+T[1].name+' oyunu silinsin? Bu oyunun proqnozları xallara daxil olmayacaq.'))return;
      db.ref('matches/'+mid).remove().catch(function(){alert('Silmək alınmadı.')});
    }
  });

  mount();
  }
  if(window.MA)start();else document.addEventListener('ma:ready',start);
})();
