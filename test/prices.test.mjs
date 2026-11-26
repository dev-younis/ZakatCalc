import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const worker = (await import(`data:text/javascript,${encodeURIComponent(source)}`)).default;
const fx = {
  result: 'success',
  time_last_update_unix: 1700000000,
  rates: { USD: 1, EGP: 50, AED: 4, EUR: 0.8, BAD: 0 },
};

async function requestPrices(gold, exchange = fx) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (url.includes('open.er-api.com')) return Response.json(exchange);
    if (gold === null) throw new Error('gold unavailable');
    return Response.json(gold);
  };
  try {
    const response = await worker.fetch(new Request('https://example.test/api/prices'), {});
    return { status: response.status, data: await response.json() };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('converts supported currencies into Egyptian pounds', async () => {
  const { status, data } = await requestPrices({ price: 3110.35 });
  assert.equal(status, 200);
  assert.equal(data.currencyRates.USD, 50);
  assert.equal(data.currencyRates.AED, 12.5);
  assert.equal(data.currencyRates.EUR, 62.5);
  assert.equal(data.currencyRates.EGP, 1);
  assert.equal(data.currencyRates.BAD, undefined);
  assert.equal(data.goldGramEgp, 5000);
  assert.equal(data.fxUpdated, '2023-11-14T22:13:20.000Z');
});

test('still provides currency rates when gold is unavailable', async () => {
  const { status, data } = await requestPrices(null);
  assert.equal(status, 200);
  assert.equal(data.currencyRates.USD, 50);
  assert.equal(data.goldGramEgp, null);
});

test('rejects invalid exchange data', async () => {
  const { status, data } = await requestPrices({ price: 100 }, { ...fx, rates: { EGP: 0 } });
  assert.equal(status, 502);
  assert.equal(data.error, 'upstream failed');
});

test('manual refresh updates prices, preserves manual gold edits and reports failures', async () => {
  const script = await readFile(new URL('../public/prices.js', import.meta.url), 'utf8');
  const elements = {
    refreshPrices: { addEventListener(_event, handler) { this.click = handler; } },
    live: { textContent: '' },
    stale: { style: {} },
    currencies: { querySelectorAll: () => [] },
  };
  let resolveFetch;
  const fetch = () => new Promise(resolve => { resolveFetch = resolve; });
  let calculations = 0, saves = 0, goldApplications = 0;
  const context = createContext({
    $: id => elements[id], fetch, currencyRates: {}, liveGold: null, goldEdited: false,
    applyGold: () => goldApplications++, calc: () => calculations++, save: () => saves++,
    fmt: String, Number, Date, isNaN,
  });
  runInContext(script, context);
  assert.equal(elements.refreshPrices.disabled, true);
  resolveFetch({ ok: true, json: async () => ({ currencyRates: { USD: 50 }, goldGramEgp: 2400, fxUpdated: new Date().toISOString() }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.refreshPrices.disabled, false);
  assert.equal(context.currencyRates.USD, 50);
  assert.equal(goldApplications, 1);

  context.goldEdited = true;
  const refresh = elements.refreshPrices.click();
  assert.equal(elements.refreshPrices.disabled, true);
  resolveFetch({ ok: true, json: async () => ({ currencyRates: { USD: 55 }, goldGramEgp: 2500, fxUpdated: new Date().toISOString() }) });
  await refresh;
  assert.equal(context.currencyRates.USD, 55);
  assert.equal(goldApplications, 1);
  assert.match(elements.live.textContent, /يدويًا لم يتغير/);
  assert.equal(calculations, 2);
  assert.equal(saves, 2);

  const failed = elements.refreshPrices.click();
  resolveFetch({ ok: false });
  await failed;
  assert.equal(elements.refreshPrices.disabled, false);
  assert.match(elements.live.textContent, /تعذر تحديث/);
  assert.equal(context.currencyRates.USD, 55);
});
