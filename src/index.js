async function prices() {
  try {
    const [fxRes, goldRes] = await Promise.all([
      fetch('https://open.er-api.com/v6/latest/USD'),
      fetch('https://api.gold-api.com/price/XAU'),
    ]);
    const fx = await fxRes.json();
    const gold = await goldRes.json();

    const usdEgp = fx.rates.EGP;
    const aedEgp = usdEgp / fx.rates.AED;
    const xauUsd = gold.price; // USD per troy ounce
    if (!usdEgp || !fx.rates.AED || !xauUsd) throw new Error('bad data');
    const goldGramEgp = (xauUsd / 31.1035) * usdEgp; // 24k gram in EGP

    return new Response(
      JSON.stringify({ usdEgp, aedEgp, xauUsd, goldGramEgp, updated: new Date().toISOString() }),
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
