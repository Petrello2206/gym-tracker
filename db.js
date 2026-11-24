/* Gym Tracker – Datenschicht
 * Lokaler Speicher (localStorage) + Synchronisation mit deinem Google-Apps-Script.
 * Stellt dieselbe kleine API bereit, die die App bisher genutzt hat:
 *   db.doc('a/b').set/update/delete/get/onSnapshot
 *   db.collection('a').orderBy().limit().onSnapshot/get, collection('a').doc()
 */
(function(){
  const LS_DB='gt-db-v1', LS_OUT='gt-outbox-v1', LS_CFG='gt-sync-v1';
  const load=(k,d)=>{ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } };
  const save=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){ console.warn('Speichern fehlgeschlagen',e); } };

  // store: { docs:{path:{data,ts}}, deleted:{path:ts} }
  const store=load(LS_DB,{docs:{},deleted:{}});
  let outbox=load(LS_OUT,[]);
  const subs=new Set();
  const clone=o=>JSON.parse(JSON.stringify(o));
  const persist=()=>{ save(LS_DB,store); save(LS_OUT,outbox); };
  let notifyT=null;
  const notify=()=>{ clearTimeout(notifyT); notifyT=setTimeout(()=>subs.forEach(f=>{ try{ f(); }catch(e){ console.error(e); } }),0); };
  const now=()=>Date.now();

  function write(op,path,data){
    const ts=now();
    if(op==='delete'){ delete store.docs[path]; store.deleted[path]=ts; }
    else if(op==='update'){ const old=store.docs[path]?store.docs[path].data:{}; store.docs[path]={data:{...old,...clone(data)},ts}; delete store.deleted[path]; }
    else { store.docs[path]={data:clone(data),ts}; delete store.deleted[path]; }
    outbox.push({op:op==='update'?'set':op, path, data:op==='delete'?null:store.docs[path].data, ts});
    persist(); notify(); scheduleFlush();
    return Promise.resolve();
  }

  const meta={fromCache:false, hasPendingWrites:false};
  function docRef(path){
    const id=path.split('/').pop();
    const snap=()=>{ const d=store.docs[path]; return {id, exists:!!d, data:()=>d?clone(d.data):undefined, metadata:meta}; };
    return { path, id,
      get(){ return Promise.resolve(snap()); },
      set(d){ return write('set',path,d); },
      update(d){ return write('update',path,d); },
      delete(){ return write('delete',path); },
      onSnapshot(next){ const f=()=>next(snap()); subs.add(f); setTimeout(f,0); return ()=>subs.delete(f); } };
  }
  function collection(path){
    const depth=path.split('/').length+1;
    const q={ _o:null, _l:100000,
      orderBy(f,dir){ return {...this, _o:[f,dir||'asc']}; },
      limit(n){ return {...this, _l:n}; },
      doc(id){ return docRef(path+'/'+(id||(now().toString(36)+Math.random().toString(36).slice(2,8)))); },
      _snap(){
        let docs=Object.keys(store.docs).filter(k=>k.startsWith(path+'/') && k.split('/').length===depth)
          .map(k=>{ const d=store.docs[k]; return {id:k.split('/').pop(), exists:true, data:()=>clone(d.data), _d:d.data}; });
        if(this._o){ const [f,dir]=this._o; docs.sort((a,b)=>((a._d[f]>b._d[f])?1:(a._d[f]<b._d[f])?-1:0)*(dir==='desc'?-1:1)); }
        docs=docs.slice(0,this._l);
        return {docs, size:docs.length, empty:!docs.length, metadata:meta};
      },
      get(){ return Promise.resolve(this._snap()); },
      onSnapshot(next){ const self=this, f=()=>next(self._snap()); subs.add(f); setTimeout(f,0); return ()=>subs.delete(f); } };
    return q;
  }

  /* ---------- Synchronisation mit Google Apps Script ---------- */
  let cfg=load(LS_CFG,null);           // {url, token}
  const status={state:cfg?'idle':'local', last:null, error:null};
  const statusSubs=new Set();
  const setState=(s,err)=>{ status.state=s; status.error=err||null; statusSubs.forEach(f=>f(status)); };

  async function call(params, body){
    const u=new URL(cfg.url); Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v)); u.searchParams.set('token',cfg.token);
    const r=await fetch(u.toString(), body? {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({token:cfg.token, ...body})} : {});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json(); if(j.error) throw new Error(j.error); return j;
  }
  let flushT=null, flushing=false;
  function scheduleFlush(){ if(!cfg) return; clearTimeout(flushT); flushT=setTimeout(flush,800); }
  async function flush(){
    if(!cfg || flushing || !outbox.length) return;
    if(!navigator.onLine){ setState('offline'); return; }
    flushing=true; setState('saving');
    const batch=outbox.slice(0,200);
    try{ await call({action:'push'},{ops:batch}); outbox=outbox.slice(batch.length); persist(); status.last=new Date(); setState(outbox.length?'saving':'synced'); if(outbox.length) setTimeout(flush,100); }
    catch(e){ setState('error', String(e.message||e)); setTimeout(flush,15000); }
    finally{ flushing=false; }
  }
  async function pull(){
    if(!cfg) return;
    if(!navigator.onLine){ setState('offline'); return; }
    try{
      setState('loading');
      const remote=await call({action:'pull'});
      let changed=false;
      for(const [p,d] of Object.entries(remote.docs||{})){
        const loc=store.docs[p], del=store.deleted[p]||0;
        if((!loc || d.ts>loc.ts) && d.ts>del){ store.docs[p]=d; delete store.deleted[p]; changed=true; }
      }
      for(const [p,ts] of Object.entries(remote.deleted||{})){
        const loc=store.docs[p];
        if(loc && ts>loc.ts){ delete store.docs[p]; store.deleted[p]=ts; changed=true; }
      }
      // lokale Dokumente, die der Server noch nicht kennt, hochladen
      for(const [p,d] of Object.entries(store.docs)){
        const r=(remote.docs||{})[p];
        if((!r || d.ts>r.ts) && !outbox.some(o=>o.path===p)) outbox.push({op:'set',path:p,data:d.data,ts:d.ts});
      }
      persist(); if(changed) notify();
      status.last=new Date(); setState(outbox.length?'saving':'synced');
      flush();
    }catch(e){ setState('error', String(e.message||e)); }
  }
  setInterval(()=>{ if(document.visibilityState==='visible') pull(); }, 90000);
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') pull(); else flush(); });
  window.addEventListener('online',()=>{ flush(); pull(); });

  const db={ doc:docRef, collection };
  window.GT={
    db, status,
    onStatus(f){ statusSubs.add(f); f(status); return ()=>statusSubs.delete(f); },
    config(){ return cfg; },
    async connect(url,token){ cfg={url:url.trim(), token:token.trim()}; await call({action:'ping'}); save(LS_CFG,cfg); await pull(); return true; },
    disconnect(){ cfg=null; localStorage.removeItem(LS_CFG); setState('local'); },
    pull, flush,
    pending(){ return outbox.length; },
    seedIfEmpty(path,data){ if(!store.docs[path] && !store.deleted[path]){ store.docs[path]={data:clone(data),ts:1}; persist(); } },
    exportAll(){ const c={}; for(const [p,d] of Object.entries(store.docs)){ const i=p.lastIndexOf('/'); const col=p.slice(0,i), id=p.slice(i+1); (c[col]=c[col]||{})[id]=d.data; } return {exportedAt:new Date().toISOString(), app:'Gym Tracker', collections:c}; },
    importAll(obj){ const c=obj.collections||{}; let n=0; for(const col of Object.keys(c)) for(const id of Object.keys(c[col])){ write('set',col+'/'+id,c[col][id]); n++; } return n; }
  };
  if(cfg) setTimeout(pull,50);
})();
