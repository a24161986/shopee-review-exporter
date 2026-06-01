const test = require('node:test');
const assert = require('node:assert/strict');
const shopeeSites = require('../extension/shared/shopee-sites.js');
const urlParser = require('../extension/shared/url-parser.js');

function loadContentScanner({ locationHref, anchorHrefs, bodyText = '', title = 'Shopee product' }) {
  const contentPath = require.resolve('../extension/content/content.js');
  delete require.cache[contentPath];

  const previous = {
    document: global.document,
    location: global.location,
    ShopeeReviewExporter: global.ShopeeReviewExporter
  };

  global.ShopeeReviewExporter = { ...shopeeSites, ...urlParser };
  global.location = { href: locationHref };
  global.document = {
    title,
    body: { innerText: bodyText },
    querySelectorAll(selector) {
      assert.equal(selector, 'a[href]');
      return anchorHrefs.map((href) => ({ href }));
    }
  };

  require(contentPath);
  const scanner = global.ShopeeReviewExporter.scanCurrentPage;

  return {
    scan: () => scanner(),
    cleanup() {
      global.document = previous.document;
      global.location = previous.location;
      global.ShopeeReviewExporter = previous.ShopeeReviewExporter;
      delete require.cache[contentPath];
    }
  };
}

test('scanCurrentPage includes the current product URL and ignores category breadcrumbs', () => {
  const harness = loadContentScanner({
    locationHref: 'https://shopee.vn/Product-Name-i.881817146.23661062670?sp_atk=abc',
    anchorHrefs: [
      'https://shopee.vn/Blenders-Mixers-Grinders-cat.11036971.11111623',
      'https://shopee.vn/Blenders-Mixers-Grinders-cat.11036971.11111623.11111629'
    ]
  });

  try {
    const result = harness.scan();
    assert.equal(result.pageUrl, 'https://shopee.vn/Product-Name-i.881817146.23661062670?sp_atk=abc');
    assert.deepEqual(result.products.map((product) => product.key), [
      'shopee.vn:881817146:23661062670'
    ]);
  } finally {
    harness.cleanup();
  }
});

test('scanCurrentPage returns only the current product on a Shopee product page', () => {
  const harness = loadContentScanner({
    locationHref: 'https://shopee.vn/Product-Name-i.881817146.23661062670?sp_atk=abc',
    anchorHrefs: [
      'https://shopee.vn/Related-Product-i.881817146.26908126944',
      'https://shopee.vn/Another-Related-Product-i.881817146.21578336285'
    ],
    bodyText: 'Recommended https://shopee.vn/Text-Product-i.881817146.12345678901'
  });

  try {
    const result = harness.scan();
    assert.deepEqual(result.products.map((product) => product.key), [
      'shopee.vn:881817146:23661062670'
    ]);
  } finally {
    harness.cleanup();
  }
});

test('scanCurrentPage keeps batch scanning for non-product pages', () => {
  const harness = loadContentScanner({
    locationHref: 'https://shopee.vn/search?keyword=blender',
    anchorHrefs: [
      'https://shopee.vn/Product-One-i.1.2',
      'https://shopee.vn/Product-Two-i.3.4'
    ]
  });

  try {
    const result = harness.scan();
    assert.deepEqual(result.products.map((product) => product.key), [
      'shopee.vn:1:2',
      'shopee.vn:3:4'
    ]);
  } finally {
    harness.cleanup();
  }
});
