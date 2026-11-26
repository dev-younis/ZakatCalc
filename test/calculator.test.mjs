import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const script = html.split('<script>')[1].split('document.addEventListener')[0];

function calculator() {
  const elements = {};
  const element = id => elements[id] ||= { value: '', textContent: '', validity: { badInput: false } };
  element('currencies').querySelectorAll = () => [];
  element('nisabType').value = 'gold';
  const context = createContext({
    document: { getElementById: element },
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
    Intl, Number, Object, Set, isFinite,
  });
  runInContext(script, context);
  return { context, element };
}

function search(context, query, selected = '', autoSelect = false) {
  const row = {
    querySelector(selector) {
      return selector === '.currency-search' ? { value: query } : this.status;
    },
    status: { textContent: '' },
  };
  const select = {
    options: [],
    closest: () => row,
    replaceChildren(option) { this.options = [option]; },
    add(option) { this.options.push(option); },
  };
  context.select = select;
  context.selected = selected;
  context.autoSelect = autoSelect;
  runInContext('currencyOptions(select, selected, autoSelect)', context);
  return { codes: select.options.map(option => option.value), selected: select.value, status: row.status.textContent };
}

test('searches supported currencies by Arabic and English country or currency', () => {
  const { context } = calculator();
  for (const [query, code] of [['France', 'EUR'], ['فرنسا', 'EUR'], ['United States', 'USD'], ['ريال سعودي', 'SAR'], ['usd', 'USD']]) {
    assert.ok(search(context, query).codes.includes(code), query);
  }
  assert.ok(!search(context, '').codes.includes('JPY'));
  assert.ok(!search(context, '').codes.includes('ILS'));
  assert.match(search(context, 'Japan').status, /لا توجد/);
  assert.ok(search(context, 'France', 'USD').codes.includes('USD'));
});

test('automatically selects a unique search result but preserves selections for ambiguous searches and refreshes', () => {
  const { context } = calculator();
  assert.equal(search(context, 'France', 'USD', true).selected, 'EUR');
  assert.equal(search(context, 'ريال', 'SAR', true).selected, 'SAR');
  assert.equal(search(context, 'France', '', false).selected, '');
  assert.equal(search(context, 'Japan', 'USD', true).selected, 'USD');
});

test('values quarter 21K coins by count, validates and resets their displayed value', () => {
  const { context, element } = calculator();
  element('r_gold').value = '2400';
  element('goldCoins21Count').value = '12.5';
  runInContext('calc()', context);
  assert.equal(element('assets').textContent, '210,000 ج.م');
  assert.equal(element('zakat').textContent, '5,250');
  element('goldCoins21Count').value = '0.25';
  runInContext('calc()', context);
  assert.equal(element('assets').textContent, '4,200 ج.م');
  element('goldCoins21Count').value = '-1';
  runInContext('calc()', context);
  assert.equal(element('assets').textContent, '—');
  assert.match(element('state').textContent, /عدد العملات/);
  element('goldCoins21Count').value = '';
  runInContext('calc()', context);
  assert.equal(element('s_goldCoins21Count').textContent, '');
});

test('keeps an unsupported saved currency visible without calculating it', () => {
  const { context, element } = calculator();
  assert.ok(search(context, '', 'JPY').codes.includes('JPY'));
  const row = {
    querySelector(selector) {
      if (selector === 'select') return { value: 'JPY' };
      if (selector === '.currency-amount') return { value: '100', validity: { badInput: false } };
      return { textContent: '' };
    },
  };
  element('currencies').querySelectorAll = () => [row];
  runInContext('currencyRates.JPY = 0.3; calc()', context);
  assert.equal(element('assets').textContent, '—');
  assert.match(element('state').textContent, /تعذر حساب الزكاة/);
});
