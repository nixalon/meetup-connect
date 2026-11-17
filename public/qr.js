(() => {
  // Your access key travels in the URL *fragment* (#key=...), which browsers never send
  // to the server, so it doesn't appear in server logs or Referer headers.
  // Bookmark https://<your-site>/qr.html#key=<QR_ACCESS_KEY> on your phone.
  const STORAGE = 'qr-access-key';
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('key');
  let key = fromHash;
  try {
    if (fromHash) localStorage.setItem(STORAGE, fromHash);
    else key = localStorage.getItem(STORAGE);
  } catch { /* storage blocked: fall back to the fragment */ }

  const img = document.getElementById('qr');
  const hint = document.getElementById('hint');
  const refresh = document.getElementById('refresh');
  let timer = null;

  async function load() {
    if (!key) {
      hint.textContent = 'Missing access key. Open this page via your bookmarked link.';
      return;
    }
    try {
      const r = await fetch('/api/qr', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' });
      if (r.status === 401) throw new Error('Wrong access key.');
      if (!r.ok) throw new Error(`Could not load QR code (${r.status}).`);
      const ttl = Number(r.headers.get('X-Link-Expires-In')) || 7200;
      const blob = await r.blob();
      if (img.src) URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(blob);
      img.hidden = false;
      refresh.hidden = false;
      hint.textContent = `Valid for ${Math.round(ttl / 60)} min. Refreshes automatically.`;
      clearTimeout(timer);
      // Refresh well before expiry so someone scanning never gets a dead link.
      timer = setTimeout(load, Math.max(60, ttl / 2) * 1000);
    } catch (e) {
      hint.textContent = e.message;
    }
  }

  refresh.addEventListener('click', load);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  load();
})();
