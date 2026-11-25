// Share to Nostr. With a Nostr signer in the browser (a NIP-07 extension such as Alby or nos2x), the note is signed there and
// sent to a few public relays; nothing is signed or sent without the extension asking you first. Without one, the text is
// copied so it can be pasted into any Nostr app. Only runs when the button is pressed.
export const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];

function publish(url, ev, ms = 6000) {
  return new Promise((resolve) => {
    let ws, done = false; const end = (v) => { if (done) return; done = true; clearTimeout(to); try { ws && ws.close(); } catch { /* */ } resolve(v); };
    const to = setTimeout(() => end(false), ms);
    try { ws = new WebSocket(url); } catch { end(false); return; }
    ws.onopen = () => ws.send(JSON.stringify(['EVENT', ev]));
    ws.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m[0] === 'OK' && m[1] === ev.id) end(m[2] === true); } catch { /* ignore */ } };
    ws.onerror = () => end(false);
  });
}
// -> { how: 'posted', relays: n } | { how: 'copied' } | { how: 'failed' }
export async function shareNostr(text) {
  const n = typeof window !== 'undefined' && window.nostr;
  if (n && typeof n.signEvent === 'function') {
    try {
      const ev = await n.signEvent({ kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [['t', 'bitcoin'], ['t', 'blockhorizon']], content: text });
      const ok = (await Promise.all(RELAYS.map((r) => publish(r, ev)))).filter(Boolean).length;
      return ok ? { how: 'posted', relays: ok } : { how: 'failed' };
    } catch { return { how: 'failed' }; } // declined in the extension, or it failed
  }
  try { await navigator.clipboard.writeText(text); return { how: 'copied' }; } catch { return { how: 'failed' }; }
}
