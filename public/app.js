const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel:not(.setup)');
const apiInput = document.getElementById('apiBase');
const statusEl = document.getElementById('status');

const saved = localStorage.getItem('CONVERTER_API_BASE') || window.CONVERTER_API_BASE || '';
apiInput.value = saved;

function apiBase() {
  return (localStorage.getItem('CONVERTER_API_BASE') || window.CONVERTER_API_BASE || '').replace(/\/$/, '');
}

function apiUrl(path) {
  const base = apiBase();
  if (!base) throw new Error('Skriv in din backend-URL först. Ex: https://din-app.onrender.com');
  return `${base}${path}`;
}

tabs.forEach(tab => tab.addEventListener('click', () => {
  tabs.forEach(t => t.classList.remove('active'));
  panels.forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  document.getElementById(tab.dataset.view).classList.add('active');
}));

document.getElementById('saveApi').addEventListener('click', () => {
  localStorage.setItem('CONVERTER_API_BASE', apiInput.value.trim().replace(/\/$/, ''));
  statusEl.innerHTML = '<span class="ok">Backend-URL sparad.</span>';
});

document.getElementById('testApi').addEventListener('click', async () => {
  localStorage.setItem('CONVERTER_API_BASE', apiInput.value.trim().replace(/\/$/, ''));
  statusEl.textContent = 'Testar backend...';
  try {
    const res = await fetch(apiUrl('/api/status'));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Backend svarade inte korrekt.');
    const tools = Object.entries(data.tools || {}).map(([k,v]) => `${k}: ${v ? '✅' : '❌'}`).join(' · ');
    statusEl.innerHTML = `<span class="ok">Backend funkar.</span><br>${tools}`;
  } catch (err) {
    statusEl.innerHTML = `<span class="bad">${err.message}</span>`;
  }
});

async function sendForm(form, path, resultEl) {
  resultEl.innerHTML = 'Jobbar... detta kan ta en stund för stora filer.';
  try {
    const res = await fetch(apiUrl(path), { method: 'POST', body: new FormData(form) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Något gick fel');
    const base = apiBase();
    const links = (data.files || []).map(f => `<a href="${base}${f.url}" download>${f.name}</a>`).join('');
    resultEl.innerHTML = `
      <a class="download" href="${base}${data.download}" download>⬇ Ladda ner resultat${data.download.endsWith('.zip') ? ' ZIP' : ''}</a>
      <div class="list">${links}</div>
    `;
  } catch (err) {
    resultEl.innerHTML = `<span class="error">${err.message}</span>`;
  }
}

document.getElementById('convertForm').addEventListener('submit', e => {
  e.preventDefault();
  sendForm(e.currentTarget, '/api/convert', document.getElementById('convertResult'));
});

document.getElementById('watermarkForm').addEventListener('submit', e => {
  e.preventDefault();
  sendForm(e.currentTarget, '/api/watermark', document.getElementById('watermarkResult'));
});
