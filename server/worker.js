import history from '../data/history.json';
import { amount, splitMoney, generatorAllocation, generatorSettlement } from '../src/ledger.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const clean=(s,max=500)=>{if(typeof s!=='string'||!s.trim()||s.length>max)throw Error('Required text is missing or too long.');return s.trim();};
const email=s=>{s=clean(s,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw Error('Enter a valid email address.');return s;};
function validateEntry(raw){
  const id=clean(raw.id,60);if(!/^[\w-]{16,60}$/.test(id))throw Error('Invalid record ID.');
  const date=clean(raw.date,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Enter a valid date.');
  const note=clean(raw.note),kind=raw.kind;
  if(!['payment','bill','adjustment','generator-charge','generator-expense','generator-settlement'].includes(kind))throw Error('Invalid record type.');
  const result={id,date,note,kind,amount:kind==='generator-settlement'&&raw.amount==='0.00'?'0.00':amount(raw.amount)};
  if(kind==='payment'||kind==='adjustment'){if(!Number.isInteger(raw.house)||raw.house<1||raw.house>9)throw Error('Select a house.');result.house=raw.house;}
  if(kind==='payment'){result.reference=clean(raw.reference,120);result.fund=raw.fund==='generator'?'generator':'general';}
  if(kind==='adjustment'){if(!['credit','debit'].includes(raw.direction))throw Error('Select credit or debit.');result.direction=raw.direction;}
  if(kind==='bill'){
    if(!Array.isArray(raw.houses)||raw.houses.some(h=>!Number.isInteger(h)||h<1||h>9))throw Error('Select eligible houses.');
    result.allocations=splitMoney(result.amount,raw.houses);result.category=clean(raw.category,80);
    if(result.category==='Generator')throw Error('Record generator costs in the generator fund to avoid billing the same cost twice.');
  }
  if(kind==='generator-charge'){result.rate=raw.rate;result.units=raw.units;result.occupied=raw.occupied;result.allocations=generatorAllocation({budget:result.amount,rate:raw.rate,units:raw.units,occupied:raw.occupied});result.basis=clean(raw.basis,200);}
  return result;
}
async function handle(request,env){
  const url=new URL(request.url);const local=env.LOCAL_DEVELOPMENT==='true'&&['localhost','127.0.0.1'].includes(url.hostname);
  const who=local?'owner@example.test':request.headers.get('oai-authenticated-user-email')?.toLowerCase();
  if(!who)return json({error:'Sign in to access the estate records.'},401);
  const owner=who===(env.OWNER_EMAIL||'').toLowerCase();
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  const recorder=owner||Boolean(await env.DB.prepare('SELECT email FROM recorders WHERE email = ?').bind(who).first());
  if(request.method==='GET'){
    if(url.pathname==='/api/history')return json(history);
    if(url.pathname==='/api/state'){
      const rows=await env.DB.prepare('SELECT payload, actor, created_at FROM entries ORDER BY created_at, id').all();
      const list=await env.DB.prepare('SELECT email, created_at FROM recorders ORDER BY email').all();
      return json({email:who,owner,recorder,local,entries:rows.results.map(r=>({...JSON.parse(r.payload),actor:r.actor,createdAt:r.created_at})),recorders:owner?list.results:[],imported:await env.DB.prepare('SELECT id FROM imports WHERE id = ?').bind(history.sha256).first()!==null});
    }
    if(url.pathname==='/api/backup'){const rows=await env.DB.prepare('SELECT * FROM entries ORDER BY created_at, id').all();return json({history,entries:rows.results});}
    if(url.pathname==='/api/original')return env.ASSETS.fetch(new Request(new URL('/original-workbook.xlsx',url)));
    return json({error:'Not found'},404);
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(!recorder)return json({error:'Only designated recorders can change the ledger.'},403);
  if(request.headers.get('Origin')!==url.origin&&!(local&&request.headers.get('Origin')===env.DEV_FRONTEND_ORIGIN))return json({error:'Request origin does not match.'},403);
  if(!request.headers.get('Content-Type')?.includes('application/json'))return json({error:'JSON required'},415);
  const text=await request.text();if(text.length>30000)return json({error:'Record too large'},413);
  const raw=JSON.parse(text);
  if(url.pathname==='/api/import'){
    if(!owner)return json({error:'Only the owner can initialise the archive.'},403);
    await env.DB.prepare('INSERT OR IGNORE INTO imports (id,payload,imported_at) VALUES (?,?,?)').bind(history.sha256,JSON.stringify(history),history.importedAt).run();
    return json({sha256:history.sha256});
  }
  if(url.pathname==='/api/recorders'){
    if(!owner)return json({error:'Only the owner can appoint recorders.'},403);
    const target=email(raw.email);
    if(raw.action==='remove')await env.DB.prepare('DELETE FROM recorders WHERE email=?').bind(target).run();
    else await env.DB.prepare('INSERT OR IGNORE INTO recorders(email,created_by,created_at) VALUES (?,?,?)').bind(target,who,new Date().toISOString()).run();
    return json({success:true});
  }
  if(url.pathname==='/api/entries'){
    const entry=validateEntry(raw);
    if(entry.kind==='generator-settlement'){
      const advanceId=clean(raw.advanceId,60);
      const row=await env.DB.prepare('SELECT payload FROM entries WHERE id=?').bind(advanceId).first();
      const advance=row&&JSON.parse(row.payload);
      if(advance?.kind!=='generator-charge')throw Error('Choose a recorded generator advance.');
      entry.id='close-'+advanceId;entry.advanceId=advanceId;entry.units=raw.units;entry.basis=clean(raw.basis,200);
      entry.rate=advance.rate;entry.occupied=advance.occupied;
      entry.allocations=generatorSettlement(advance,{budget:entry.amount,units:entry.units});
    }
    const payload=JSON.stringify(entry);
    const existing=await env.DB.prepare('SELECT payload FROM entries WHERE id=?').bind(entry.id).first();
    if(existing)return existing.payload===payload?json({success:true,id:entry.id}):json({error:'Record ID already exists with different content.'},409);
    await env.DB.prepare('INSERT OR IGNORE INTO entries(id,kind,payload,actor,created_at) VALUES (?,?,?,?,?)').bind(entry.id,entry.kind,payload,who,new Date().toISOString()).run();
    const saved=await env.DB.prepare('SELECT payload FROM entries WHERE id=?').bind(entry.id).first();
    if(saved.payload!==payload)return json({error:'Conflicting record. Refresh and try again.'},409);
    return json({success:true,id:entry.id},201);
  }
  return json({error:'Not found'},404);
}
export default {async fetch(request,env){try{return await handle(request,env);}catch(error){return json({error:error.message||'Request could not be completed.'},400);}}};
