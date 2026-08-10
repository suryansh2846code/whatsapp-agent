/**
 * The CRM dashboard page — one server-rendered HTML document with inline CSS +
 * JS. Mobile-first: everything is a card (great on a phone), centred and roomy
 * on desktop. The JS fetches /api/leads and /api/bookings and renders them;
 * user data is inserted with textContent (never innerHTML) so it can't inject.
 */
export function renderDashboardPage(businessName: string, email: string): string {
  // Embed header values safely as JSON literals.
  const bn = JSON.stringify(businessName);
  const em = JSON.stringify(email);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(businessName)} — Dashboard</title>
<style>
  :root { --bg:#f5f6f8; --card:#fff; --line:#e5e7eb; --ink:#111827; --muted:#6b7280;
          --blue:#2563eb; --green:#16a34a; --amber:#d97706; --red:#dc2626; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; }
  header { position:sticky; top:0; background:var(--card); border-bottom:1px solid var(--line);
           padding:12px 16px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
  header .biz { font-weight:700; }
  header .who { color:var(--muted); font-size:12px; }
  header a { color:var(--blue); text-decoration:none; font-size:14px; }
  main { max-width:780px; margin:0 auto; padding:12px 12px 40px; }
  .tabs { display:flex; gap:8px; margin:8px 0 12px; }
  .tab { flex:1; padding:10px; border:1px solid var(--line); background:var(--card); border-radius:10px;
         font-weight:600; cursor:pointer; text-align:center; }
  .tab.active { background:var(--blue); color:#fff; border-color:var(--blue); }
  .filters { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
  .chip { padding:6px 12px; border:1px solid var(--line); background:var(--card); border-radius:999px;
          font-size:13px; cursor:pointer; }
  .chip.active { background:var(--ink); color:#fff; border-color:var(--ink); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px;
          margin-bottom:10px; }
  .card .row1 { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .card .name { font-weight:700; font-size:16px; }
  .card .phone { color:var(--muted); font-size:13px; margin-top:2px; }
  .card .when { color:var(--muted); font-size:12px; margin-top:6px; }
  .card .msg { white-space:pre-line; background:var(--bg); border-radius:8px; padding:8px;
               margin-top:8px; font-size:14px; max-height:120px; overflow:auto; }
  .card .req { font-weight:600; margin-top:6px; }
  .wa { background:var(--green); color:#fff; padding:6px 10px; border-radius:8px; font-size:13px;
        text-decoration:none; white-space:nowrap; }
  select, textarea { font:inherit; width:100%; padding:8px; border:1px solid var(--line);
                     border-radius:8px; margin-top:8px; background:var(--card); color:var(--ink); }
  textarea { min-height:44px; resize:vertical; }
  label { font-size:12px; color:var(--muted); }
  .empty { color:var(--muted); text-align:center; padding:32px 0; }
  @media (min-width:640px){ .card .msg{ max-height:160px; } }
</style>
</head>
<body>
<header>
  <div>
    <div class="biz" id="biz"></div>
    <div class="who" id="who"></div>
  </div>
  <a href="/auth/logout">Log out</a>
</header>
<main>
  <div class="tabs">
    <div class="tab active" data-tab="leads" id="tab-leads">Leads</div>
    <div class="tab" data-tab="bookings" id="tab-bookings">Bookings</div>
  </div>
  <div class="filters" id="filters"></div>
  <div id="list"><div class="empty">Loading…</div></div>
</main>
<script>
const BIZ = ${bn}, EMAIL = ${em};
const LEAD_STATUSES = ["new","contacted","converted","lost"];
const BOOKING_STATUSES = ["requested","confirmed","done","cancelled"];
let state = { tab:"leads", filter:"all", leads:[], bookings:[] };

document.getElementById("biz").textContent = BIZ;
document.getElementById("who").textContent = EMAIL;

async function load(){
  const [l,b] = await Promise.all([
    fetch("/api/leads").then(r=>r.json()),
    fetch("/api/bookings").then(r=>r.json()),
  ]);
  state.leads = l.leads || [];
  state.bookings = b.bookings || [];
  render();
}

function setTab(t){ state.tab=t; state.filter="all";
  document.querySelectorAll(".tab").forEach(el=>el.classList.toggle("active", el.dataset.tab===t));
  render();
}
document.querySelectorAll(".tab").forEach(el=>el.onclick=()=>setTab(el.dataset.tab));

function waLink(phone){ const a=document.createElement("a"); a.className="wa";
  a.href="https://wa.me/"+phone.replace(/\\D/g,""); a.target="_blank"; a.textContent="WhatsApp"; return a; }

function statusSelect(current, options, onChange){
  const s=document.createElement("select");
  options.forEach(o=>{ const op=document.createElement("option"); op.value=o; op.textContent=o;
    if(o===current) op.selected=true; s.appendChild(op); });
  s.onchange=()=>onChange(s.value); return s;
}

function render(){
  const statuses = state.tab==="leads"?LEAD_STATUSES:BOOKING_STATUSES;
  const filters = document.getElementById("filters"); filters.innerHTML="";
  ["all",...statuses].forEach(f=>{ const c=document.createElement("div");
    c.className="chip"+(state.filter===f?" active":""); c.textContent=f;
    c.onclick=()=>{ state.filter=f; render(); }; filters.appendChild(c); });

  const list=document.getElementById("list"); list.innerHTML="";
  const items=(state.tab==="leads"?state.leads:state.bookings)
    .filter(x=>state.filter==="all"||x.status===state.filter);
  if(items.length===0){ const e=document.createElement("div"); e.className="empty";
    e.textContent="Nothing here yet."; list.appendChild(e); return; }
  items.forEach(x=> list.appendChild(state.tab==="leads"?leadCard(x):bookingCard(x)));
}

function leadCard(x){
  const c=div("card");
  const r=div("row1"); const nm=div("name"); nm.textContent=x.name||"Unknown";
  r.appendChild(nm); r.appendChild(waLink(x.phone)); c.appendChild(r);
  const ph=div("phone"); ph.textContent="+"+x.phone.replace(/\\D/g,""); c.appendChild(ph);
  const msg=div("msg"); msg.textContent=x.messages||""; c.appendChild(msg);
  c.appendChild(labelled("Status", statusSelect(x.status, LEAD_STATUSES, v=>patch("leads",x.id,{status:v}))));
  const ta=document.createElement("textarea"); ta.value=x.notes||""; ta.placeholder="Notes…";
  ta.onblur=()=>{ if(ta.value!==(x.notes||"")){ x.notes=ta.value; patch("leads",x.id,{notes:ta.value}); } };
  c.appendChild(labelled("Notes", ta));
  const w=div("when"); w.textContent="Updated "+fmt(x.updated_at); c.appendChild(w);
  return c;
}

function bookingCard(x){
  const c=div("card");
  const r=div("row1"); const nm=div("name"); nm.textContent=x.name||"Unknown";
  r.appendChild(nm); r.appendChild(waLink(x.phone)); c.appendChild(r);
  const ph=div("phone"); ph.textContent="+"+x.phone.replace(/\\D/g,""); c.appendChild(ph);
  const req=div("req"); req.textContent="🗓 "+x.requested_time; c.appendChild(req);
  if(x.message){ const m=div("msg"); m.textContent=x.message; c.appendChild(m); }
  c.appendChild(labelled("Status", statusSelect(x.status, BOOKING_STATUSES, v=>patch("bookings",x.id,{status:v}))));
  const w=div("when"); w.textContent="Updated "+fmt(x.updated_at); c.appendChild(w);
  return c;
}

function labelled(text, el){ const wrap=document.createElement("div");
  const l=document.createElement("label"); l.textContent=text; wrap.appendChild(l); wrap.appendChild(el); return wrap; }
function div(cls){ const d=document.createElement("div"); d.className=cls; return d; }
function fmt(iso){ try{ return new Date(iso).toLocaleString(); }catch(e){ return iso; } }

async function patch(kind, id, body){
  await fetch("/api/"+kind+"/"+id, { method:"PATCH",
    headers:{"content-type":"application/json"}, body:JSON.stringify(body) });
  // update local copy so filters stay correct
  const arr = kind==="leads"?state.leads:state.bookings;
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
