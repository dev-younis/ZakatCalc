async function prices() {
  try {
    const [fxRes, goldResult] = await Promise.all([
      fetch('https://open.er-api.com/v6/latest/USD'),
      fetch('https://api.gold-api.com/price/XAU')
        .then(res => res.ok ? res.json() : null)
        .catch(() => null),
    ]);
    if (!fxRes.ok) throw new Error('exchange rates unavailable');
    const fx = await fxRes.json();
    const usdEgp = fx.rates?.EGP;
    if (fx.result !== 'success' || !Number.isFinite(usdEgp) || usdEgp <= 0) {
      throw new Error('invalid exchange rates');
    }
    const currencyRates = {};
    for (const [code, rate] of Object.entries(fx.rates)) {
      if (/^[A-Z]{3}$/.test(code) && Number.isFinite(rate) && rate > 0) {
        currencyRates[code] = usdEgp / rate;
      }
    }
    currencyRates.EGP = 1;
    const xauUsd = goldResult?.price;
    const goldGramEgp = Number.isFinite(xauUsd) && xauUsd > 0
      ? (xauUsd / 31.1035) * usdEgp
      : null;
    const fxUpdated = Number.isFinite(fx.time_last_update_unix) && fx.time_last_update_unix > 0
      ? new Date(fx.time_last_update_unix * 1000).toISOString()
      : null;

    return new Response(
      JSON.stringify({ usdEgp, aedEgp: currencyRates.AED, currencyRates, fxUpdated, goldGramEgp, updated: new Date().toISOString() }),
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: 'upstream failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/prices') return prices();
    return env.ASSETS.fetch(request);
  },
};
