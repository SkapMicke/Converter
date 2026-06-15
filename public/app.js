const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

tabs.forEach(tab => tab.addEventListener('click', () => {
  tabs.forEach(t => t.classList.remove('active'));
  panels.forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  document.getElementById(tab.dataset.view).classList.add('active');
}));

async function sendForm(form, url, resultEl) {
  resultEl.innerHTML = 'Jobbar...';
  try {
    const res = await fetch(url, { method: 'POST', body: new FormData(form) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Något gick fel');
    const links = (data.files || []).map(f => `<a href="${f.url}" download>${f.name}</a>`).join('');
    resultEl.innerHTML = `
      <a class="download" href="${data.download}" download>⬇ Ladda ner resultat${data.download.endsWith('.zip') ? ' ZIP' : ''}</a>
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
