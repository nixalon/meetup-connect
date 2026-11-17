(() => {
  const cfg = window.CONNECT_CONFIG;
  const $ = (id) => document.getElementById(id);

  $('name').textContent = cfg.name;
  document.title = `Connect with ${cfg.name}`;
  $('linkedin').href = cfg.linkedinUrl;

  // Keep the signed token in memory and strip it from the address bar,
  // so it doesn't get copied or shared along with the URL.
  const params = new URLSearchParams(location.search);
  const token = params.get('t') || '';
  if (token) history.replaceState(null, '', location.pathname);

  const form = $('email-form');
  const status = $('status');
  let widgetId = null;

  function setStatus(msg, kind) {
    status.textContent = msg;
    status.className = kind || '';
  }

  $('show-email').addEventListener('click', () => {
    if (!token) {
      setStatus('This page only works from a fresh QR code. Please scan it again.', 'error');
      return;
    }
    form.hidden = false;
    $('show-email').hidden = true;
    $('email').focus();
    if (window.turnstile && widgetId === null) {
      widgetId = window.turnstile.render('#turnstile', { sitekey: cfg.turnstileSiteKey });
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('email').value.trim();
    if (!$('email').checkValidity() || !email) {
      setStatus('Please enter a valid email address.', 'error');
      return;
    }
    const turnstileToken = window.turnstile ? window.turnstile.getResponse(widgetId) : '';
    if (!turnstileToken) {
      setStatus('Please wait a moment for the bot check to finish.', 'error');
      return;
    }

    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    setStatus('Sending…');
    try {
      const r = await fetch('/api/send-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, turnstileToken, website: form.website.value }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      form.hidden = true;
      setStatus(`Done! The CV is on its way to ${email}.`, 'success');
    } catch (err) {
      setStatus(err.message, 'error');
      button.disabled = false;
      if (window.turnstile) window.turnstile.reset(widgetId);
    }
  });
})();
