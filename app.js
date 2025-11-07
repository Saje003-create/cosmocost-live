
// Local storage helpers
const DBKEY = 'cosmocost_live_v1';
const defaultData = {
  catalog: {},
  formulas: {},
  lastFormula:""
};

function loadDB(){
  try{
    const raw = localStorage.getItem(DBKEY);
    if(!raw){ localStorage.setItem(DBKEY, JSON.stringify(defaultData)); return structuredClone(defaultData); }
    return JSON.parse(raw);
  }catch(e){ console.error(e); return structuredClone(defaultData); }
}
function saveDB(db){ localStorage.setItem(DBKEY, JSON.stringify(db)); }

// Units
function toGrams(value, unit){
  if(unit==='g') return value;
  if(unit==='kg') return value*1000;
  if(unit==='mL') return value;
  if(unit==='L') return value*1000;
  return value;
}
function toBaseMass(value, unit, density){
  if(unit==='g' || unit==='kg') return toGrams(value, unit);
  const ml = (unit==='mL') ? value : value*1000;
  return ml * (density || 1);
}
function niceMoney(x){ return (Math.round(x*100)/100).toFixed(2); }
function roundPrice(x, step){ const s = parseFloat(step); return Math.ceil(x/s)*s; }

// Views
const navBtns = document.querySelectorAll('nav button');
const views = document.querySelectorAll('.view');
navBtns.forEach(btn=>btn.addEventListener('click', ()=>{
  navBtns.forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  views.forEach(v=>v.classList.remove('active'));
  document.getElementById(btn.dataset.view).classList.add('active');
  window.scrollTo({top:0, behavior:'smooth'});
}));

// Formula logic
const formulaBody = document.getElementById('formulaBody');
const percentTotal = document.getElementById('percentTotal');
const addRowBtn = document.getElementById('addRow');
const saveFormulaBtn = document.getElementById('saveFormula');
const newFormulaBtn = document.getElementById('newFormula');
const loadFormulaSel = document.getElementById('loadFormula');
const deleteFormulaBtn = document.getElementById('deleteFormula');
const formulaNameEl = document.getElementById('formulaName');
let DB = loadDB();

function refreshFormulaList(){
  loadFormulaSel.innerHTML = '<option value="">Load...</option>' + Object.keys(DB.formulas).map(name=>`<option>${name}</option>`).join('');
  if(DB.lastFormula && DB.formulas[DB.lastFormula]){
    loadFormulaSel.value = DB.lastFormula;
    loadFormula(DB.lastFormula);
  }
}
function addFormulaRow(ing='', pct=''){
  const row = document.createElement('tr');
  row.innerHTML = `
    <td><input class="ingName" placeholder="Ingredient" value="${ing}"></td>
    <td><input class="ingPct" type="number" step="0.01" value="${pct}"></td>
    <td><button class="linkCatalog">Link</button></td>
    <td><button class="removeRow">×</button></td>
  `;
  formulaBody.appendChild(row);
  row.querySelector('.removeRow').addEventListener('click', ()=>{ row.remove(); calcPercentTotal(); });
  row.querySelector('.ingPct').addEventListener('input', calcPercentTotal);
  row.querySelector('.linkCatalog').addEventListener('click', ()=>{
    const name = row.querySelector('.ingName').value.trim();
    if(!name){ alert('Enter ingredient name first.'); return; }
    alert('Linking simply uses the same name as in catalog.\nMake sure the ingredient name matches your catalog entry exactly.');
  });
}
function calcPercentTotal(){
  let total = 0;
  document.querySelectorAll('.ingPct').forEach(i=> total += parseFloat(i.value||0));
  percentTotal.textContent = total.toFixed(2) + '%';
  percentTotal.style.color = Math.abs(total-100)<0.01 ? '#8bd3ff' : '#ffb86b';
}
addRowBtn.addEventListener('click', ()=>addFormulaRow());

saveFormulaBtn.addEventListener('click', ()=>{
  const name = formulaNameEl.value.trim();
  if(!name){ alert('Name your formula'); return; }
  const rows = Array.from(document.querySelectorAll('#formulaBody tr')).map(tr=>{
    return { ing: tr.querySelector('.ingName').value.trim(), pct: parseFloat(tr.querySelector('.ingPct').value||0) };
  }).filter(r=>r.ing && r.pct>0);
  DB.formulas[name] = rows;
  DB.lastFormula = name;
  saveDB(DB);
  refreshFormulaList();
  alert('Formula saved.');
});
newFormulaBtn.addEventListener('click', ()=>{
  formulaNameEl.value = '';
  formulaBody.innerHTML = '';
  calcPercentTotal();
});
loadFormulaSel.addEventListener('change', ()=>{
  const name = loadFormulaSel.value;
  if(name) loadFormula(name);
});
function loadFormula(name){
  formulaNameEl.value = name;
  formulaBody.innerHTML = '';
  (DB.formulas[name]||[]).forEach(row=> addFormulaRow(row.ing, row.pct));
  calcPercentTotal();
}
deleteFormulaBtn.addEventListener('click', ()=>{
  const name = loadFormulaSel.value || formulaNameEl.value.trim();
  if(!name || !DB.formulas[name]){ alert('Select a saved formula first.'); return; }
  if(confirm('Delete formula "'+name+'"?')){
    delete DB.formulas[name];
    if(DB.lastFormula===name) DB.lastFormula='';
    saveDB(DB); refreshFormulaList(); newFormulaBtn.click();
  }
});

// Catalog logic
const catalogList = document.getElementById('catalogList');
const catalogSearch = document.getElementById('catalogSearch');
const addIngredientBtn = document.getElementById('addIngredient');

function renderCatalog(filter=''){
  catalogList.innerHTML='';
  const norm = filter.trim().toLowerCase();
  Object.keys(DB.catalog).sort().forEach(ing=>{
    const suppliers = DB.catalog[ing];
    if(norm && !(ing.toLowerCase().includes(norm) || suppliers.some(s=>s.supplier.toLowerCase().includes(norm)))) return;
    const wrap = document.createElement('div'); wrap.className='ing';
    const best = bestOffer(suppliers);
    wrap.innerHTML = `
      <h3>${ing}</h3>
      <div class="muted">Best effective price: ${best ? ('$'+niceMoney(best.effective)+'/kg') : '—'}</div>
      <div class="suppliers"></div>
      <div><button class="addSup">+ Add Supplier</button> <button class="delIng danger">Delete Ingredient</button></div>
    `;
    const supWrap = wrap.querySelector('.suppliers');
    suppliers.forEach((s,i)=> supWrap.appendChild(supplierCard(ing,i,s)));
    wrap.querySelector('.addSup').addEventListener('click', ()=>{
      DB.catalog[ing].push({supplier:"",packSize:1000,packUnit:"g",price:0,shipping:0,url:"",updated:""});
      saveDB(DB); renderCatalog(norm);
    });
    wrap.querySelector('.delIng').addEventListener('click', ()=>{
      if(confirm('Delete ingredient "'+ing+'"?')){ delete DB.catalog[ing]; saveDB(DB); renderCatalog(norm); }
    });
    catalogList.appendChild(wrap);
  });
}
function supplierCard(ing, idx, s){
  const div = document.createElement('div'); div.className='supplier';
  div.innerHTML = `
    <div class="grid3">
      <label>Supplier <input class="sup" value="${s.supplier||''}"></label>
      <label>Pack Size <input class="pack" type="number" value="${s.packSize||0}"></label>
      <label>Unit <select class="punit"><option>g</option><option>kg</option><option>mL</option><option>L</option></select></label>
      <label>Price (AUD) <input class="price" type="number" step="0.01" value="${s.price||0}"></label>
      <label>Shipping (AUD) <input class="ship" type="number" step="0.01" value="${s.shipping||0}"></label>
      <label>URL <input class="url" value="${s.url||''}"></label>
    </div>
    <div class="grid2">
      <small class="muted">Updated: <input class="updated" type="date" value="${s.updated||''}" /></small>
      <div class="right">
        <button class="saveSup">Save</button>
        <button class="delSup danger">Delete</button>
      </div>
    </div>
  `;
  div.querySelector('.punit').value = s.packUnit||'g';
  div.querySelector('.saveSup').addEventListener('click', ()=>{
    const parent = div;
    const obj = {
      supplier: parent.querySelector('.sup').value,
      packSize: parseFloat(parent.querySelector('.pack').value||0),
      packUnit: parent.querySelector('.punit').value,
      price: parseFloat(parent.querySelector('.price').value||0),
      shipping: parseFloat(parent.querySelector('.ship').value||0),
      url: parent.querySelector('.url').value,
      updated: parent.querySelector('.updated').value
    };
    DB.catalog[ing][idx] = obj; saveDB(DB); renderCatalog(catalogSearch.value);
  });
  div.querySelector('.delSup').addEventListener('click', ()=>{
    DB.catalog[ing].splice(idx,1); if(DB.catalog[ing].length===0) delete DB.catalog[ing];
    saveDB(DB); renderCatalog(catalogSearch.value);
  });
  return div;
}
catalogSearch.addEventListener('input', ()=> renderCatalog(catalogSearch.value));
addIngredientBtn.addEventListener('click', ()=>{
  const name = prompt('Ingredient name');
  if(!name) return;
  if(!DB.catalog[name]) DB.catalog[name] = [];
  saveDB(DB); renderCatalog();
});

function bestOffer(suppliers){
  if(!suppliers || suppliers.length===0) return null;
  let best = null;
  suppliers.forEach(s=>{
    const grams = (s.packUnit==='kg'||s.packUnit==='L') ? s.packSize*1000 : s.packSize;
    const effectivePerKg = ((s.price + s.shipping) / grams) * 1000; // $/kg
    const obj = { ...s, effective: effectivePerKg };
    if(!best || effectivePerKg < best.effective) best = obj;
  });
  return best;
}

// Batch & cost calculation
const calcBtn = document.getElementById('calcCosts');
const resultsDiv = document.getElementById('costResults');

function getFormula(){
  const rows = Array.from(document.querySelectorAll('#formulaBody tr')).map(tr=>({
    ing: tr.querySelector('.ingName').value.trim(),
    pct: parseFloat(tr.querySelector('.ingPct').value||0)
  })).filter(r=>r.ing && r.pct>0);
  return rows;
}

calcBtn.addEventListener('click', ()=>{
  const density = parseFloat(document.getElementById('density').value||1);
  const bSize = parseFloat(document.getElementById('batchSize').value||0);
  const bUnit = document.getElementById('batchUnit').value;
  const wastage = parseFloat(document.getElementById('wastage').value||0)/100;
  const fillSize = parseFloat(document.getElementById('fillSize').value||0);
  const fillUnit = document.getElementById('fillUnit').value;
  const containerCost = parseFloat(document.getElementById('containerCost').value||0);
  const labelCost = parseFloat(document.getElementById('labelCost').value||0);
  const otherPack = parseFloat(document.getElementById('otherPackCost').value||0);
  const laborBatch = parseFloat(document.getElementById('laborBatch').value||0);
  const overheadBatch = parseFloat(document.getElementById('overheadBatch').value||0);
  const gstOn = document.getElementById('gstOn').value === 'on';

  const batchGrams = toBaseMass(bSize, bUnit, density);
  const usable = batchGrams * (1 - wastage);
  const fillGrams = toBaseMass(fillSize, fillUnit, density);
  const units = Math.floor(usable / fillGrams);

  const formula = getFormula();
  let materialCost = 0;
  let rowsHtml = '<table class="tbl"><tr><th>Ingredient</th><th>Needed (g)</th><th>Best $/kg</th><th>Cost</th></tr>';
  formula.forEach(row=>{
    const needG = batchGrams * (row.pct/100);
    const offers = DB.catalog[row.ing];
    let bestCostPerKg = null;
    if(offers && offers.length){
      const best = bestOffer(offers);
      bestCostPerKg = best ? best.effective : null;
    }
    const cost = bestCostPerKg ? (bestCostPerKg * (needG/1000)) : 0;
    materialCost += cost;
    rowsHtml += `<tr><td>${row.ing}</td><td>${needG.toFixed(1)}</td><td>${bestCostPerKg?('$'+niceMoney(bestCostPerKg)):'—'}</td><td>$${niceMoney(cost)}</td></tr>`;
  });
  rowsHtml += '</table>';

  const packCostPerUnit = containerCost + labelCost + otherPack;
  const laborPerUnit = units>0 ? laborBatch/units : 0;
  const overheadPerUnit = units>0 ? overheadBatch/units : 0;
  const materialPerUnit = units>0 ? materialCost/units : 0;
  const cogs = materialPerUnit + packCostPerUnit + laborPerUnit + overheadPerUnit;
  const gstPerUnit = gstOn ? cogs*0.10 : 0;
  const cogsInclGST = cogs + gstPerUnit;

  resultsDiv.innerHTML = `
    <p><b>Units:</b> ${units} &nbsp; <span class="muted">(usable ${usable.toFixed(0)}g from ${batchGrams.toFixed(0)}g batch incl. ${Math.round(wastage*100)}% wastage)</span></p>
    ${rowsHtml}
    <p><b>Material Cost (batch):</b> $${niceMoney(materialCost)}</p>
    <p><b>Per-Unit Costs:</b></p>
    <ul>
      <li>Material: $${niceMoney(materialPerUnit)}</li>
      <li>Packaging: $${niceMoney(packCostPerUnit)}</li>
      <li>Labor: $${niceMoney(laborPerUnit)}</li>
      <li>Overhead: $${niceMoney(overheadPerUnit)}</li>
      <li><b>COGS excl. GST:</b> $${niceMoney(cogs)}</li>
      <li>${gstOn?('<b>GST 10%:</b> $'+niceMoney(gstPerUnit)):'GST: off'}</li>
      <li><b>COGS incl. GST:</b> $${niceMoney(cogsInclGST)}</li>
    </ul>
  `;

  window.__cogs = cogsInclGST;
  window.__units = units;
});

// Pricing
const calcPricesBtn = document.getElementById('calcPrices');
const priceResults = document.getElementById('priceResults');

calcPricesBtn.addEventListener('click', ()=>{
  const cogs = window.__cogs || 0;
  const whMargin = (parseFloat(document.getElementById('whMargin').value||40))/100;
  const rtMargin = (parseFloat(document.getElementById('rtMargin').value||60))/100;
  const step = parseFloat(document.getElementById('roundTo').value||0.10);

  if(cogs<=0){ priceResults.innerHTML = '<p class="muted">Calculate costs first.</p>'; return; }

  const wholesale = roundPrice(cogs/(1-whMargin), step);
  const retail = roundPrice(cogs/(1-rtMargin), step);
  const keystone = roundPrice(cogs*2.0, step);
  const premium = roundPrice(cogs*3.0, step);
  const luxe = roundPrice(cogs*4.0, step);

  priceResults.innerHTML = `
    <p><b>COGS (per unit):</b> $${niceMoney(cogs)}</p>
    <table class="tbl">
      <tr><th>Model</th><th>Price</th><th>Implied Margin</th></tr>
      <tr><td>Target Wholesale</td><td>$${niceMoney(wholesale)}</td><td>${Math.round((1 - cogs/wholesale)*100)}%</td></tr>
      <tr><td>Target Retail</td><td>$${niceMoney(retail)}</td><td>${Math.round((1 - cogs/retail)*100)}%</td></tr>
      <tr><td>Keystone (2× COGS)</td><td>$${niceMoney(keystone)}</td><td>${Math.round((1 - cogs/keystone)*100)}%</td></tr>
      <tr><td>Premium (3×)</td><td>$${niceMoney(premium)}</td><td>${Math.round((1 - cogs/premium)*100)}%</td></tr>
      <tr><td>Luxe (4×)</td><td>$${niceMoney(luxe)}</td><td>${Math.round((1 - cogs/luxe)*100)}%</td></tr>
    </table>
    <p class="muted">Tip: sanity-check against your market positioning and competitor pricing.</p>
  `;
});

// Export/Import
const exportBtn = document.getElementById('exportJSON');
const importInput = document.getElementById('importJSON');
exportBtn.addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(DB, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'cosmocost_backup.json'; a.click();
  URL.revokeObjectURL(url);
});
importInput.addEventListener('change', (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const obj = JSON.parse(reader.result);
      DB = obj; saveDB(DB);
      refreshFormulaList(); renderCatalog();
      alert('Import complete.');
    }catch(err){ alert('Invalid JSON'); }
  };
  reader.readAsText(file);
});

// Live Prices
const liveUrl = document.getElementById('liveUrl');
const fetchLive = document.getElementById('fetchLive');
const liveResult = document.getElementById('liveResult');

fetchLive.addEventListener('click', async ()=>{
  liveResult.textContent = 'Fetching...';
  try{
    const url = '/.netlify/functions/scrape?url=' + encodeURIComponent(liveUrl.value.trim());
    const res = await fetch(url);
    if(!res.ok) throw new Error('Fetch failed');
    const data = await res.json();
    liveResult.innerHTML = '<p><b>Detected Price:</b> '+ (data.price ? ('$'+data.price) : '—') + '</p><p class="muted">Supplier guess: '+(data.supplier||'—')+'</p>';
    if(data.price) document.getElementById('livePrice').value = data.price;
    if(data.supplier) document.getElementById('liveSupplier').value = data.supplier;
  }catch(e){
    liveResult.textContent = 'Could not fetch automatically. Paste the price manually below.';
  }
});

// Save live fetch to catalog
const liveIng = document.getElementById('liveIng');
const liveSupplier = document.getElementById('liveSupplier');
const livePack = document.getElementById('livePack');
const liveUnit = document.getElementById('liveUnit');
const livePrice = document.getElementById('livePrice');
const liveShip = document.getElementById('liveShip');
const saveLiveBtn = document.getElementById('saveLiveToCatalog');
const saveLiveNotice = document.getElementById('saveLiveNotice');

saveLiveBtn.addEventListener('click', ()=>{
  const ing = liveIng.value.trim(); if(!ing) return alert('Ingredient name required');
  const sup = liveSupplier.value.trim() || 'Unknown Supplier';
  const obj = {
    supplier: sup,
    packSize: parseFloat(livePack.value||0),
    packUnit: liveUnit.value,
    price: parseFloat(livePrice.value||0),
    shipping: parseFloat(liveShip.value||0),
    url: liveUrl.value.trim(),
    updated: (new Date()).toISOString().slice(0,10)
  };
  if(!DB.catalog[ing]) DB.catalog[ing] = [];
  DB.catalog[ing].push(obj);
  saveDB(DB); renderCatalog();
  saveLiveNotice.textContent = 'Saved to catalog for '+ing;
});

// On load
refreshFormulaList();
renderCatalog();
