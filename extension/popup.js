const APP = 'https://frosty-fantasy-pros.vercel.app';

function getCookie(name) {
  return new Promise((resolve) => {
    chrome.cookies.get({ url: 'https://fantasy.espn.com', name }, (c) => resolve(c ? c.value : null));
  });
}

function attrEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.getElementById('copy').addEventListener('click', async () => {
  const msg = document.getElementById('msg');
  try {
    const [swid, espnS2] = await Promise.all([getCookie('SWID'), getCookie('espn_s2')]);
    if (!swid || !espnS2) {
      msg.textContent = 'No ESPN session found. Open espn.com and log in first.';
      msg.className = 'bad';
      return;
    }
    await navigator.clipboard.writeText(`SWID=${swid}, espn_s2=${espnS2}`);
    msg.textContent = 'Copied! Paste into Frosty on your iPhone once — it remembers.';
    msg.className = 'ok';
  } catch (err) {
    msg.textContent = `Copy failed: ${err.message}`;
    msg.className = 'bad';
  }
});

document.getElementById('go').addEventListener('click', async () => {
  const msg = document.getElementById('msg');
  const btn = document.getElementById('go');
  btn.disabled = true;
  msg.textContent = '';
  msg.className = '';
  try {
    const [swid, espnS2] = await Promise.all([getCookie('SWID'), getCookie('espn_s2')]);
    if (!swid || !espnS2) {
      msg.textContent = 'No ESPN session found. Open espn.com and log in first.';
      msg.className = 'bad';
      btn.disabled = false;
      return;
    }
    const res = await fetch(`${APP}/api/espn/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ swid, espnS2 }),
    });
    if (!res.ok) throw new Error(`App responded ${res.status}`);
    // Hand off to the app UI (session also flows via per-request headers there).
    const url = chrome.runtime.getURL('handoff.html');
    chrome.tabs.create({ url: `${url}#${encodeURIComponent(JSON.stringify({ swid, espnS2 }))}` });
    msg.textContent = 'Session sent — finishing in the app…';
    msg.className = 'ok';
  } catch (err) {
    msg.textContent = `Failed: ${err.message}`;
    msg.className = 'bad';
    btn.disabled = false;
  }
});
