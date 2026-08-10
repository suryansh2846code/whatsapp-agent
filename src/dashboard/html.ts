/**
 * The CRM dashboard page — one server-rendered HTML document with inline CSS +
 * JS. Mobile-first: everything is a card, plus a row of stat tiles and a Settings
 * tab to edit the bot's knowledge. User data is inserted with textContent (never
 * innerHTML) so it can't inject.
 */
export function renderDashboardPage(businessName: string, email: string): string {
  const bn = JSON.stringify(businessName);
  const em = JSON.stringify(email);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(businessName)} — Dashboard</title>
<style>
  :root { --bg:#f5f6f8; --card:#fff; --line:#e5e7eb; --ink:#111827; --muted:#6b7280; --blue:#2563eb; --green:#16a34a; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; }
  header { position:sticky; top:0; background:var(--card); border-bottom:1px solid var(--line); z-index:5;
           padding:12px 16px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
  header .biz { font-weight:700; }
  header .who { color:var(--muted); font-size:12px; }
  header a { color:var(--blue); text-decoration:none; font-size:14px; }
  main { max-width:820px; margin:0 auto; padding:12px 12px 40px; }
  .tiles { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:12px; }
  .tile { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px; text-align:center; }
  .tile .n { font-size:22px; font-weight:700; }
  .tile .l { font-size:12px; color:var(--muted); margin-top:2px; }
  .tabs { display:flex; gap:8px; margin:0 0 12px; }
  .tab { flex:1; padding:10px; border:1px solid var(--line); background:var(--card); border-radius:10px;
         font-weight:600; cursor:pointer; text-align:center; }
  .tab.active { background:var(--blue); color:#fff; border-color:var(--blue); }
  .filters { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
  .chip { padding:6px 12px; border:1px solid var(--line); background:var(--card); border-radius:999px; font-size:13px; cursor:pointer; }
  .chip.active { background:var(--ink); color:#fff; border-color:var(--ink); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px; margin-bottom:10px; }
  .card .row1 { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .card .name { font-weight:700; font-size:16px; }
  .card .phone { color:var(--muted); font-size:13px; margin-top:2px; }
  .card .when { color:var(--muted); font-size:12px; margin-top:6px; }
  .card .msg { white-space:pre-line; background:var(--bg); border-radius:8px; padding:8px; margin-top:8px; font-size:14px; max-height:140px; overflow:auto; }
  .card .req { font-weight:600; margin-top:6px; }
  .wa { background:var(--green); color:#fff; padding:6px 10px; border-radius:8px; font-size:13px; text-decoration:none; white-space:nowrap; }
  select, textarea, input { font:inherit; width:100%; padding:8px; border:1px solid var(--line); border-radius:8px; margin-top:8px; background:var(--card); color:var(--ink); }
  textarea { min-height:44px; resize:vertical; }
  .knowledge { min-height:280px; font-family: ui-monospace, Menlo, monospace; font-size:13px; }
  label { font-size:12px; color:var(--muted); }
  button.save { margin-top:10px; background:var(--blue); color:#fff; border:none; padding:10px 16px; border-radius:8px; font-weight:600; cursor:pointer; }
  .savedmsg { color:var(--green); font-size:13px; margin-left:10px; }
  .frow { display:flex; gap:8px; align-items:center; margin-top:8px; }
  .frow > input { flex:1; margin-top:0; }
  .reqlbl { font-size:13px; color:var(--muted); white-space:nowrap; display:flex; align-items:center; gap:4px; }
  .reqlbl input { width:auto; margin:0; }
  .sbtn { background:#eef2ff; border:1px solid var(--line); border-radius:8px; padding:6px 10px; font-size:13px; cursor:pointer; margin-top:8px; }
  .empty { color:var(--muted); text-align:center; padding:32px 0; }
  @media (max-width:520px){ .tiles { grid-template-columns:repeat(2,1fr); } }
</style>
</head>
<body>
<header>
  <div><div class="biz" id="biz"></div><div class="who" id="who"></div></div>
  <a href="/auth/logout">Log out</a>
</header>
<main>
  <div class="tiles" id="stats"></div>
  <div class="tabs">
    <div class="tab active" data-tab="leads">Leads</div>
    <div class="tab" data-tab="requests">Requests</div>
    <div class="tab" data-tab="actions">Actions</div>
    <div class="tab" data-tab="settings">Settings</div>
  </div>
  <div class="filters" id="filters"></div>
  <div id="list"><div class="empty">Loading…</div></div>
</main>
<script>
const BIZ = ${bn}, EMAIL = ${em};
const LEAD_STATUSES = ["new","contacted","converted","lost"];
const SUBMISSION_STATUSES = ["new","in_progress","done","cancelled"];
let state = { tab:"leads", filter:"all", leads:[], submissions:[] };

document.getElementById("biz").textContent = BIZ;
document.getElementById("who").textContent = EMAIL;

async function load(){
  const [l,b] = await Promise.all([
    fetch("/api/leads").then(r=>r.json()),
    fetch("/api/submissions").then(r=>r.json()),
  ]);
  state.leads = l.leads || [];
  state.submissions = b.submissions || [];
  render();
}

function setTab(t){ state.tab=t; state.filter="all";
  document.querySelectorAll(".tab").forEach(el=>el.classList.toggle("active", el.dataset.tab===t));
  render();
}
document.querySelectorAll(".tab").forEach(el=>el.onclick=()=>setTab(el.dataset.tab));

function renderStats(){
  const L=state.leads, B=state.submissions;
  const total=L.length;
  const neu=L.filter(x=>x.status==="new").length;
  const conv=L.filter(x=>x.status==="converted").length;
  const pct= total? Math.round(conv/total*100):0;
  const weekAgo=Date.now()-7*86400000;
  const bWeek=B.filter(x=>{ const t=Date.parse(x.created_at); return t && t>weekAgo; }).length;
  const tiles=[["Leads",total],["New",neu],["Converted",conv],["Conv.",pct+"%"],["Requests",B.length],["This week",bWeek]];
  const el=document.getElementById("stats"); el.innerHTML="";
  tiles.forEach(([label,n])=>{ const t=div("tile"); const nn=div("n"); nn.textContent=String(n);
    const ll=div("l"); ll.textContent=label; t.appendChild(nn); t.appendChild(ll); el.appendChild(t); });
}

function render(){
  renderStats();
  const filters=document.getElementById("filters");
  const list=document.getElementById("list");
  if(state.tab==="settings"){ filters.innerHTML=""; renderSettings(list); return; }
  if(state.tab==="actions"){ filters.innerHTML=""; renderActionsEditor(list); return; }

  const statuses = state.tab==="leads"?LEAD_STATUSES:SUBMISSION_STATUSES;
  filters.innerHTML="";
  ["all",...statuses].forEach(f=>{ const c=div("chip"+(state.filter===f?" active":"")); c.textContent=f;
    c.onclick=()=>{ state.filter=f; render(); }; filters.appendChild(c); });

  list.innerHTML="";
  const items=(state.tab==="leads"?state.leads:state.submissions).filter(x=>state.filter==="all"||x.status===state.filter);
  if(items.length===0){ const e=div("empty"); e.textContent="Nothing here yet."; list.appendChild(e); return; }
  items.forEach(x=> list.appendChild(state.tab==="leads"?leadCard(x):submissionCard(x)));
}

async function renderSettings(container){
  container.innerHTML=""; const c=div("card");
  const info=div("empty"); info.textContent="Loading settings…"; c.appendChild(info); container.appendChild(c);
  const s=await fetch("/api/settings").then(r=>r.json());
  c.innerHTML="";
  const name=inp(s.displayName||"");
  c.appendChild(labelled("Business name", name));
  const wa=inp(s.whatsappPhoneNumberId||"");
  c.appendChild(labelled("WhatsApp phone number ID (from Meta — connects your number to the bot)", wa));
  const langs=inp((s.languages||["English"]).join(", "));
  c.appendChild(labelled("Languages (comma-separated)", langs));
  const ta=document.createElement("textarea"); ta.className="knowledge"; ta.value=s.knowledge||"";
  c.appendChild(labelled("Knowledge — the facts the bot answers from (fees, timings, etc.)", ta));
  const fb=document.createElement("textarea"); fb.value=s.fallbackMessage||"";
  c.appendChild(labelled("Fallback message — sent when the bot doesn't know the answer", fb));
  const btn=document.createElement("button"); btn.className="save"; btn.textContent="Save";
  const msg=document.createElement("span"); msg.className="savedmsg";
  btn.onclick=async()=>{ btn.disabled=true; msg.textContent="Saving…";
    await fetch("/api/settings",{ method:"PATCH", headers:{"content-type":"application/json"},
      body:JSON.stringify({ displayName:name.value, whatsappPhoneNumberId:wa.value,
        languages:langs.value.split(",").map(x=>x.trim()).filter(Boolean),
        knowledge:ta.value, fallbackMessage:fb.value }) });
    btn.disabled=false; msg.textContent="Saved ✓"; setTimeout(()=>msg.textContent="",2500);
    document.getElementById("biz").textContent=name.value||BIZ; };
  const bar=div(""); bar.appendChild(btn); bar.appendChild(msg); c.appendChild(bar);
}
function inp(v){ const i=document.createElement("input"); i.type="text"; i.value=v; return i; }

let actionsModel=[];
async function renderActionsEditor(container){
  container.innerHTML='<div class="empty">Loading…</div>';
  const r=await fetch("/api/actions").then(x=>x.json());
  actionsModel=(r.actions||[]).map(a=>({ label:a.label||"", description:a.description||"",
    fields:(a.fields||[]).map(f=>({ label:f.label||f.key||"", required:!!f.required })),
    confirmation:a.confirmation||"" }));
  drawActions(container);
}
function drawActions(container){
  container.innerHTML="";
  const intro=div("empty"); intro.style.textAlign="left"; intro.style.padding="0 0 8px";
  intro.textContent="Define what your bot can DO. Each action collects a few fields, then records a request.";
  container.appendChild(intro);
  actionsModel.forEach((a)=>{
    const c=div("card");
    const nm=inp(a.label); nm.placeholder="e.g. Order"; nm.oninput=()=>{ a.label=nm.value; };
    c.appendChild(labelled("Action name", nm));
    const ds=inp(a.description); ds.placeholder="e.g. when a customer wants to buy something"; ds.oninput=()=>{ a.description=ds.value; };
    c.appendChild(labelled("When should the bot use this?", ds));
    const fwrap=div(""); const fl=document.createElement("label"); fl.textContent="Fields to collect"; fwrap.appendChild(fl);
    a.fields.forEach((f)=>{
      const row=div("frow");
      const fin=inp(f.label); fin.placeholder="e.g. Item"; fin.oninput=()=>{ f.label=fin.value; }; row.appendChild(fin);
      const rl=document.createElement("label"); rl.className="reqlbl";
      const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=f.required; cb.onchange=()=>{ f.required=cb.checked; };
      rl.appendChild(cb); rl.appendChild(document.createTextNode("required")); row.appendChild(rl);
      const del=btnSmall("✕"); del.onclick=()=>{ a.fields.splice(a.fields.indexOf(f),1); drawActions(container); }; row.appendChild(del);
      fwrap.appendChild(row);
    });
    const addF=btnSmall("+ field"); addF.onclick=()=>{ a.fields.push({label:"",required:true}); drawActions(container); }; fwrap.appendChild(addF);
    c.appendChild(fwrap);
    const ph=a.fields.map(f=>"{"+slug(f.label)+"}").filter(x=>x!=="{}").concat("{business}").join(" ");
    const cf=document.createElement("textarea"); cf.value=a.confirmation; cf.placeholder="Thanks! We've got your request."; cf.oninput=()=>{ a.confirmation=cf.value; };
    c.appendChild(labelled("Confirmation message — you can use: "+ph, cf));
    const delA=btnSmall("Remove action"); delA.onclick=()=>{ actionsModel.splice(actionsModel.indexOf(a),1); drawActions(container); }; c.appendChild(delA);
    container.appendChild(c);
  });
  const bar=div("");
  const addA=btnSmall("+ Add action"); addA.onclick=()=>{ actionsModel.push({label:"",description:"",fields:[],confirmation:""}); drawActions(container); };
  const save=document.createElement("button"); save.className="save"; save.textContent="Save actions"; save.style.marginLeft="8px";
  const msg=document.createElement("span"); msg.className="savedmsg";
  save.onclick=async()=>{ save.disabled=true; msg.textContent="Saving…";
    const payload=actionsModel.filter(a=>a.label.trim()).map(a=>({ label:a.label.trim(), description:a.description.trim(),
      fields:a.fields.filter(f=>f.label.trim()).map(f=>({ label:f.label.trim(), required:!!f.required })),
      confirmation:a.confirmation }));
    await fetch("/api/actions",{ method:"PUT", headers:{"content-type":"application/json"}, body:JSON.stringify({actions:payload}) });
    save.disabled=false; msg.textContent="Saved ✓"; setTimeout(()=>msg.textContent="",2500); };
  bar.appendChild(addA); bar.appendChild(save); bar.appendChild(msg); container.appendChild(bar);
}
function slug(s){ return (s||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,""); }
function btnSmall(t){ const b=document.createElement("button"); b.type="button"; b.className="sbtn"; b.textContent=t; return b; }

function waLink(phone){ const a=document.createElement("a"); a.className="wa";
  a.href="https://wa.me/"+phone.replace(/\\D/g,""); a.target="_blank"; a.textContent="WhatsApp"; return a; }

function statusSelect(current, options, onChange){
  const s=document.createElement("select");
  options.forEach(o=>{ const op=document.createElement("option"); op.value=o; op.textContent=o;
    if(o===current) op.selected=true; s.appendChild(op); });
  s.onchange=()=>onChange(s.value); return s;
}

function leadCard(x){
  const c=div("card");
  const r=div("row1"); const nm=div("name"); nm.textContent=x.name||"Unknown";
  r.appendChild(nm); r.appendChild(waLink(x.phone)); c.appendChild(r);
  const ph=div("phone"); ph.textContent="+"+x.phone.replace(/\\D/g,""); c.appendChild(ph);
  const msg=div("msg"); msg.textContent=x.messages||""; c.appendChild(msg);
  c.appendChild(labelled("Status", statusSelect(x.status, LEAD_STATUSES, v=>{ x.status=v; patch("leads",x.id,{status:v}); renderStats(); })));
  const ta=document.createElement("textarea"); ta.value=x.notes||""; ta.placeholder="Notes…";
  ta.onblur=()=>{ if(ta.value!==(x.notes||"")){ x.notes=ta.value; patch("leads",x.id,{notes:ta.value}); } };
  c.appendChild(labelled("Notes", ta));
  const w=div("when"); w.textContent="Updated "+fmt(x.updated_at); c.appendChild(w);
  return c;
}

function submissionCard(x){
  const c=div("card");
  const r=div("row1"); const nm=div("name"); nm.textContent=x.name||"Unknown";
  r.appendChild(nm); r.appendChild(waLink(x.phone)); c.appendChild(r);
  const ph=div("phone"); ph.textContent="+"+x.phone.replace(/\\D/g,""); c.appendChild(ph);
  const lbl=div("req"); lbl.textContent="🔖 "+(x.action_label||x.action_key); c.appendChild(lbl);
  let data={}; try{ data=JSON.parse(x.data||"{}"); }catch(e){}
  const fields=Object.entries(data).filter(function(e){ return e[0]!=="name"; });
  if(fields.length){ const m=div("msg"); m.textContent=fields.map(function(e){ return e[0]+": "+e[1]; }).join("\\n"); c.appendChild(m); }
  c.appendChild(labelled("Status", statusSelect(x.status, SUBMISSION_STATUSES, v=>{ x.status=v; patch("submissions",x.id,{status:v}); })));
  const w=div("when"); w.textContent="Updated "+fmt(x.updated_at); c.appendChild(w);
  return c;
}

function labelled(text, el){ const wrap=div(""); const l=document.createElement("label"); l.textContent=text; wrap.appendChild(l); wrap.appendChild(el); return wrap; }
function div(cls){ const d=document.createElement("div"); if(cls) d.className=cls; return d; }
function fmt(iso){ try{ return new Date(iso).toLocaleString(); }catch(e){ return iso; } }

async function patch(kind, id, body){
  await fetch("/api/"+kind+"/"+id, { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify(body) });
  const arr = kind==="leads"?state.leads:state.submissions;
  const item = arr.find(i=>i.id===id); if(item){ Object.assign(item, body); }
}

load().catch(()=>{ document.getElementById("list").innerHTML='<div class="empty">Failed to load.</div>'; });
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
