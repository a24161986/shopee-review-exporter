const test = require('node:test');
const assert = require('node:assert/strict');
const {
  productsFromTabs,
  productsFromPastedText,
  mergeProductSources,
  sourceLabel
} = require('../extension/shared/product-sources.js');

test('productsFromTabs keeps only Shopee product URLs from current window tabs', () => {
  const products = productsFromTabs([
    { id: 1, title: 'VN product', url: 'https://shopee.vn/Product-i.881817146.23661062670?sp_atk=abc' },
    { id: 2, title: 'Search', url: 'https://shopee.vn/search?keyword=blender' },
    { id: 3, title: 'Category', url: 'https://shopee.sg/Small-Kitchen-Appliances-cat.11027421.11027457' },
    { id: 4, title: 'MY product', url: 'https://shopee.com.my/product/531049349/44201384883' },
    { id: 5, title: 'Other', url: 'https://example.com/a.1.2' }
  ]);

  assert.deepEqual(products.map((product) => ({
    key: product.key,
    source: product.source,
    sources: product.sources,
    tabId: product.tabId
  })), [
    {
      key: 'shopee.vn:881817146:23661062670',
      source: '标签页',
      sources: ['tab'],
      tabId: 1
    },
    {
      key: 'shopee.com.my:531049349:44201384883',
      source: '标签页',
      sources: ['tab'],
      tabId: 4
    }
  ]);
});

test('productsFromPastedText imports product URLs and counts invalid lines', () => {
  const result = productsFromPastedText([
    'https://shopee.sg/Product-i.602945153.27881688856',
    'https://shopee.sg/Small-Kitchen-Appliances-cat.11027421.11027457',
    'ordinary text',
    'two links https://shopee.vn/A-i.1.2 and https://shopee.vn/B-i.3.4'
  ].join('\n'));

  assert.equal(result.importedCount, 3);
  assert.equal(result.ignoredCount, 2);
  assert.deepEqual(result.products.map((product) => ({
    key: product.key,
    source: product.source,
    sources: product.sources
  })), [
    { key: 'shopee.sg:602945153:27881688856', source: '粘贴', sources: ['paste'] },
    { key: 'shopee.vn:1:2', source: '粘贴', sources: ['paste'] },
    { key: 'shopee.vn:3:4', source: '粘贴', sources: ['paste'] }
  ]);
});

test('mergeProductSources dedupes products and merges source labels', () => {
  const tabProducts = productsFromTabs([
    { id: 1, title: 'VN product', url: 'https://shopee.vn/Product-i.1.2' }
  ]);
  const pasted = productsFromPastedText([
    'https://shopee.vn/Product-i.1.2',
    'https://shopee.vn/Other-i.3.4'
  ].join('\n'));

  const merged = mergeProductSources(tabProducts, pasted.products);

  assert.deepEqual(merged.map((product) => ({
    key: product.key,
    source: product.source,
    sources: product.sources
  })), [
    { key: 'shopee.vn:1:2', source: '标签页/粘贴', sources: ['tab', 'paste'] },
    { key: 'shopee.vn:3:4', source: '粘贴', sources: ['paste'] }
  ]);
});

test('sourceLabel keeps stable source display order', () => {
  assert.equal(sourceLabel(['paste', 'tab', 'paste']), '标签页/粘贴');
  assert.equal(sourceLabel(['paste']), '粘贴');
  assert.equal(sourceLabel(['tab']), '标签页');
});
