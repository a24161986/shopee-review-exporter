const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseShopeeProductUrl,
  extractShopeeProductLinks,
  dedupeProducts
} = require('../extension/shared/url-parser.js');

test('parses Shopee dot-format product URLs', () => {
  const product = parseShopeeProductUrl('https://shopee.com.my/sample-product-i.12345.67890?sp_atk=abc');
  assert.deepEqual(product, {
    url: 'https://shopee.com.my/sample-product-i.12345.67890',
    domain: 'shopee.com.my',
    marketplace: 'Malaysia',
    marketplaceCode: 'my',
    shopId: '12345',
    itemId: '67890',
    key: 'shopee.com.my:12345:67890'
  });
});

test('parses Shopee product path URLs', () => {
  const product = parseShopeeProductUrl('https://shopee.co.th/product/111/222?x=1');
  assert.equal(product.domain, 'shopee.co.th');
  assert.equal(product.marketplaceCode, 'th');
  assert.equal(product.shopId, '111');
  assert.equal(product.itemId, '222');
  assert.equal(product.url, 'https://shopee.co.th/product/111/222');
});

test('rejects non-Shopee and non-product URLs', () => {
  assert.equal(parseShopeeProductUrl('https://example.com/product/1/2'), null);
  assert.equal(parseShopeeProductUrl('https://shopee.sg/search?keyword=bag'), null);
});

test('rejects malformed encoded Shopee URLs without throwing', () => {
  assert.doesNotThrow(() => {
    assert.equal(parseShopeeProductUrl('https://shopee.sg/bad%ZZ.1.2'), null);
  });

  const products = extractShopeeProductLinks('before https://shopee.sg/bad%ZZ.1.2 after https://shopee.sg/good.1.2');
  assert.deepEqual(products.map((product) => product.key), [
    'shopee.sg:1:2'
  ]);
});

test('extracts and deduplicates product links from text', () => {
  const text = [
    'https://shopee.sg/item-name.10.20',
    'https://shopee.sg/item-name.10.20?utm_source=x',
    'https://shopee.vn/product/30/40'
  ].join(' ');
  const products = extractShopeeProductLinks(text);
  assert.equal(products.length, 2);
  assert.deepEqual(products.map((product) => product.key), [
    'shopee.sg:10:20',
    'shopee.vn:30:40'
  ]);
});

test('dedupeProducts keeps first product for each domain shop and item tuple', () => {
  const products = dedupeProducts([
    parseShopeeProductUrl('https://shopee.ph/a.1.2'),
    parseShopeeProductUrl('https://shopee.ph/b.1.2'),
    parseShopeeProductUrl('https://shopee.tw/product/1/2')
  ]);
  assert.deepEqual(products.map((product) => product.key), [
    'shopee.ph:1:2',
    'shopee.tw:1:2'
  ]);
});
