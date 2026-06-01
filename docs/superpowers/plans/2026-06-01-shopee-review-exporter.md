# Shopee Review Exporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 Chrome extension that scans the current tab for Shopee product links and exports each product's reviews as separate Excel or JSON files.

**Architecture:** The popup injects a scanner into the active tab, lists deduplicated Shopee product links, and sends selected products plus settings to the background service worker. The service worker processes a single-product queue, opens each product in an inactive tab, executes a review API request in that page, normalizes and sorts reviews newest-first, then downloads one file per product. Shared plain JavaScript modules hold parsing, normalization, sorting, and filename behavior so they can run in Chrome and in Node tests.

**Tech Stack:** Chrome Manifest V3, vanilla HTML/CSS/JavaScript, Node built-in test runner, `fflate` copied locally into the extension for creating the zip container used by `.xlsx` files.

---

## File Structure

- Create `package.json`: npm scripts for tests, manifest validation, and copying the vendored Excel library.
- Create `extension/manifest.json`: Chrome extension manifest, permissions, popup, service worker, and supported Shopee hosts.
- Create `extension/shared/shopee-sites.js`: supported marketplace metadata and URL helpers.
- Create `extension/shared/url-parser.js`: Shopee product URL parsing, normalization, scanning, and deduplication.
- Create `extension/shared/reviews.js`: review row normalization, image/video URL extraction, and newest-first sorting.
- Create `extension/shared/export-format.js`: filename generation, Excel row mapping, JSON generation, and download URL helpers.
- Create `extension/content/content.js`: current-page scanner exposed to popup script injection.
- Create `extension/popup/popup.html`: popup markup.
- Create `extension/popup/popup.css`: popup layout and visual states.
- Create `extension/popup/popup.js`: scan controls, settings, queue start, pause/resume/stop, and task rendering.
- Create `extension/background/service-worker.js`: queue orchestration, inactive product tabs, in-page API fetching, export, and downloads.
- Create `scripts/validate-manifest.js`: sanity-check the extension manifest from Node.
- Create `tests/url-parser.test.js`: URL parsing, text scanning, and deduplication tests.
- Create `tests/reviews.test.js`: review normalization and sorting tests.
- Create `tests/export-format.test.js`: filename and JSON/Excel row mapping tests.
- Create `README.md`: install, test, and load-unpacked instructions.

## Task 1: Project Harness

**Files:**
- Create: `package.json`
- Create: `scripts/validate-manifest.js`
- Create: `README.md`

- [ ] **Step 1: Create `package.json` with scripts and dependencies**

```json
{
  "name": "shopee-review-exporter",
  "version": "0.1.0",
  "private": true,
  "description": "Chrome extension for exporting Shopee product reviews from links on the current tab.",
  "type": "commonjs",
  "scripts": {
    "test": "node --test tests/*.test.js",
    "validate:manifest": "node scripts/validate-manifest.js",
    "prepare:vendor": "mkdir -p extension/lib && cp node_modules/fflate/umd/index.js extension/lib/fflate.min.js",
    "verify": "npm run test && npm run validate:manifest"
  },
  "devDependencies": {
    "fflate": "^0.8.2"
  }
}
```

- [ ] **Step 2: Create `scripts/validate-manifest.js`**

```js
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const manifestPath = path.join(__dirname, '..', 'extension', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, 'Shopee Review Exporter');
assert.ok(manifest.action.default_popup);
assert.ok(manifest.background.service_worker);
assert.ok(manifest.permissions.includes('activeTab'));
assert.ok(manifest.permissions.includes('scripting'));
assert.ok(manifest.permissions.includes('downloads'));
assert.ok(manifest.host_permissions.some((host) => host.includes('shopee.sg')));
assert.ok(manifest.host_permissions.some((host) => host.includes('shopee.com.my')));
assert.ok(manifest.host_permissions.some((host) => host.includes('shopee.co.id')));
assert.ok(manifest.host_permissions.some((host) => host.includes('shopee.co.th')));
assert.ok(manifest.host_permissions.some((host) => host.includes('shopee.ph')));
assert.ok(manifest.host_permissions.some((host) => host.includes('shopee.vn')));
assert.ok(manifest.host_permissions.some((host) => host.includes('shopee.tw')));

console.log('Manifest validation passed.');
```

- [ ] **Step 3: Create `README.md`**

```markdown
# Shopee Review Exporter

Chrome extension for scanning the current tab for Shopee product links and exporting each product's reviews to Excel or JSON.

## Development

```bash
npm install
npm run prepare:vendor
npm run verify
```

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `extension` folder.

## Usage

1. Open a page that contains Shopee product links.
2. Open the extension popup.
3. Click Scan Current Tab.
4. Choose export format, review count, and review filter.
5. Click Start Export.
```

- [ ] **Step 4: Run dependency setup**

Run: `npm install`

Expected: `node_modules` and `package-lock.json` are created.

- [ ] **Step 5: Commit harness**

```bash
git add package.json package-lock.json scripts/validate-manifest.js README.md
git commit -m "chore: add project harness"
```

## Task 2: URL Parsing And Link Scanning

**Files:**
- Create: `extension/shared/shopee-sites.js`
- Create: `extension/shared/url-parser.js`
- Create: `tests/url-parser.test.js`

- [ ] **Step 1: Write failing URL parser tests**

```js
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/url-parser.test.js`

Expected: FAIL because `extension/shared/url-parser.js` does not exist.

- [ ] **Step 3: Implement supported Shopee sites**

```js
(function attachShopeeSites(global) {
  const SUPPORTED_MARKETS = [
    { domain: 'shopee.sg', marketplace: 'Singapore', code: 'sg', imageHost: 'down-sg.img.susercontent.com' },
    { domain: 'shopee.com.my', marketplace: 'Malaysia', code: 'my', imageHost: 'down-my.img.susercontent.com' },
    { domain: 'shopee.co.id', marketplace: 'Indonesia', code: 'id', imageHost: 'down-id.img.susercontent.com' },
    { domain: 'shopee.co.th', marketplace: 'Thailand', code: 'th', imageHost: 'down-th.img.susercontent.com' },
    { domain: 'shopee.ph', marketplace: 'Philippines', code: 'ph', imageHost: 'down-ph.img.susercontent.com' },
    { domain: 'shopee.vn', marketplace: 'Vietnam', code: 'vn', imageHost: 'down-vn.img.susercontent.com' },
    { domain: 'shopee.tw', marketplace: 'Taiwan', code: 'tw', imageHost: 'down-tw.img.susercontent.com' }
  ];

  function getMarketByDomain(domain) {
    return SUPPORTED_MARKETS.find((market) => domain === market.domain || domain.endsWith(`.${market.domain}`)) || null;
  }

  const api = { SUPPORTED_MARKETS, getMarketByDomain };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ShopeeReviewExporter = Object.assign(global.ShopeeReviewExporter || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
```

- [ ] **Step 4: Implement URL parsing and scanning**

```js
(function attachUrlParser(global) {
  const siteApi = typeof require === 'function'
    ? require('./shopee-sites.js')
    : global.ShopeeReviewExporter;

  const TEXT_URL_PATTERN = /https?:\/\/(?:[a-z0-9-]+\.)?shopee\.(?:sg|com\.my|co\.id|co\.th|ph|vn|tw)\/[^\s"'<>)]*/gi;

  function normalizeUrlInput(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim().replace(/[),.;]+$/g, '');
    try {
      return new URL(trimmed);
    } catch {
      return null;
    }
  }

  function parseShopeeProductUrl(input) {
    const parsedUrl = normalizeUrlInput(input);
    if (!parsedUrl) return null;

    const domain = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();
    const market = siteApi.getMarketByDomain(domain);
    if (!market) return null;

    const pathname = decodeURIComponent(parsedUrl.pathname).replace(/\/+$/g, '');
    const productPathMatch = pathname.match(/\/product\/(\d+)\/(\d+)$/);
    const dotMatch = pathname.match(/\.([0-9]+)\.([0-9]+)$/);
    const match = productPathMatch || dotMatch;
    if (!match) return null;

    const shopId = match[1];
    const itemId = match[2];
    const normalizedUrl = `${parsedUrl.protocol}//${market.domain}${pathname}`;

    return {
      url: normalizedUrl,
      domain: market.domain,
      marketplace: market.marketplace,
      marketplaceCode: market.code,
      shopId,
      itemId,
      key: `${market.domain}:${shopId}:${itemId}`
    };
  }

  function dedupeProducts(products) {
    const seen = new Set();
    const unique = [];
    for (const product of products) {
      if (!product || seen.has(product.key)) continue;
      seen.add(product.key);
      unique.push(product);
    }
    return unique;
  }

  function extractShopeeProductLinks(text) {
    const matches = String(text || '').match(TEXT_URL_PATTERN) || [];
    return dedupeProducts(matches.map(parseShopeeProductUrl));
  }

  const api = { parseShopeeProductUrl, extractShopeeProductLinks, dedupeProducts };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ShopeeReviewExporter = Object.assign(global.ShopeeReviewExporter || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
```

- [ ] **Step 5: Run URL parser tests**

Run: `npm test -- tests/url-parser.test.js`

Expected: PASS for all URL parsing tests.

- [ ] **Step 6: Commit URL parsing**

```bash
git add extension/shared/shopee-sites.js extension/shared/url-parser.js tests/url-parser.test.js
git commit -m "feat: parse Shopee product links"
```

## Task 3: Review Normalization And Sorting

**Files:**
- Create: `extension/shared/reviews.js`
- Create: `tests/reviews.test.js`

- [ ] **Step 1: Write failing review tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeReview,
  sortReviewsNewestFirst,
  normalizeReviewsForExport
} = require('../extension/shared/reviews.js');

const product = {
  url: 'https://shopee.vn/a.1.2',
  domain: 'shopee.vn',
  marketplace: 'Vietnam',
  marketplaceCode: 'vn',
  shopId: '1',
  itemId: '2'
};

test('normalizes a Shopee review payload', () => {
  const row = normalizeReview(product, {
    author_username: 'buyer_one',
    rating_star: 5,
    comment: 'Good product',
    ctime: 1714550400,
    images: ['abc', 'https://example.com/existing.jpg'],
    videos: [{ url: 'https://video.example/a.mp4' }],
    product_items: [{ model_name: 'Blue XL' }]
  });

  assert.equal(row.productUrl, product.url);
  assert.equal(row.marketplace, 'Vietnam');
  assert.equal(row.reviewerUsername, 'buyer_one');
  assert.equal(row.rating, 5);
  assert.equal(row.comment, 'Good product');
  assert.equal(row.modelName, 'Blue XL');
  assert.equal(row.reviewTime, '2024-05-01 08:00:00');
  assert.equal(row.createdAt, 1714550400);
  assert.match(row.imageUrls, /down-vn\.img\.susercontent\.com\/file\/abc/);
  assert.match(row.imageUrls, /https:\/\/example\.com\/existing\.jpg/);
  assert.equal(row.videoUrls, 'https://video.example/a.mp4');
});

test('sortReviewsNewestFirst sorts descending by ctime', () => {
  const sorted = sortReviewsNewestFirst([
    { createdAt: 10, comment: 'older' },
    { createdAt: 30, comment: 'newer' },
    { createdAt: 20, comment: 'middle' }
  ]);

  assert.deepEqual(sorted.map((review) => review.comment), ['newer', 'middle', 'older']);
});

test('normalizeReviewsForExport normalizes and sorts newest first', () => {
  const rows = normalizeReviewsForExport(product, [
    { author_username: 'a', ctime: 100, comment: 'old' },
    { author_username: 'b', ctime: 200, comment: 'new' }
  ]);

  assert.deepEqual(rows.map((row) => row.comment), ['new', 'old']);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/reviews.test.js`

Expected: FAIL because `extension/shared/reviews.js` does not exist.

- [ ] **Step 3: Implement review normalization and sorting**

```js
(function attachReviews(global) {
  const siteApi = typeof require === 'function'
    ? require('./shopee-sites.js')
    : global.ShopeeReviewExporter;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function formatUnixTime(seconds) {
    if (!seconds) return '';
    const date = new Date(seconds * 1000);
    return [
      date.getFullYear(),
      '-',
      pad(date.getMonth() + 1),
      '-',
      pad(date.getDate()),
      ' ',
      pad(date.getHours()),
      ':',
      pad(date.getMinutes()),
      ':',
      pad(date.getSeconds())
    ].join('');
  }

  function getModelName(rawReview) {
    const productItems = Array.isArray(rawReview.product_items) ? rawReview.product_items : [];
    return productItems[0]?.model_name || '';
  }

  function getImageUrls(product, rawReview) {
    const images = Array.isArray(rawReview.images) ? rawReview.images : [];
    const market = siteApi.getMarketByDomain(product.domain);
    const imageHost = market?.imageHost || 'down-ws.img.susercontent.com';
    return images
      .map((image) => {
        if (!image) return '';
        if (/^https?:\/\//i.test(image)) return image;
        return `https://${imageHost}/file/${image}`;
      })
      .filter(Boolean)
      .join('\n');
  }

  function getVideoUrls(rawReview) {
    const videos = Array.isArray(rawReview.videos) ? rawReview.videos : [];
    return videos
      .map((video) => video?.url || '')
      .filter(Boolean)
      .join('\n');
  }

  function normalizeReview(product, rawReview) {
    const createdAt = Number(rawReview.ctime || 0);
    return {
      productUrl: product.url,
      marketplace: product.marketplace,
      domain: product.domain,
      shopId: product.shopId,
      itemId: product.itemId,
      reviewerUsername: rawReview.author_username || '',
      rating: rawReview.rating_star || '',
      comment: rawReview.comment || '',
      modelName: getModelName(rawReview),
      reviewTime: formatUnixTime(createdAt),
      createdAt,
      imageUrls: getImageUrls(product, rawReview),
      videoUrls: getVideoUrls(rawReview)
    };
  }

  function sortReviewsNewestFirst(rows) {
    return [...rows].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  function normalizeReviewsForExport(product, rawReviews) {
    return sortReviewsNewestFirst((rawReviews || []).map((rawReview) => normalizeReview(product, rawReview)));
  }

  const api = { formatUnixTime, normalizeReview, normalizeReviewsForExport, sortReviewsNewestFirst };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ShopeeReviewExporter = Object.assign(global.ShopeeReviewExporter || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
```

- [ ] **Step 4: Run review tests**

Run: `npm test -- tests/reviews.test.js`

Expected: PASS for all review normalization tests.

- [ ] **Step 5: Commit review logic**

```bash
git add extension/shared/reviews.js tests/reviews.test.js
git commit -m "feat: normalize Shopee reviews"
```

## Task 4: Export Formatting

**Files:**
- Create: `extension/shared/export-format.js`
- Create: `tests/export-format.test.js`

- [ ] **Step 1: Write failing export format tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDownloadFilename,
  toExcelRows,
  toJsonText
} = require('../extension/shared/export-format.js');

test('buildDownloadFilename includes marketplace, ids, count, and extension', () => {
  const filename = buildDownloadFilename({
    marketplaceCode: 'my',
    shopId: '123',
    itemId: '456'
  }, 99, 'xlsx');

  assert.equal(filename, 'shopee-my_123_456_99-reviews.xlsx');
});

test('toExcelRows maps internal keys to Chinese column labels', () => {
  const rows = toExcelRows([{
    productUrl: 'https://shopee.sg/a.1.2',
    marketplace: 'Singapore',
    shopId: '1',
    itemId: '2',
    reviewerUsername: 'buyer',
    rating: 4,
    comment: 'Nice',
    modelName: 'Black',
    reviewTime: '2026-01-02 03:04:05',
    imageUrls: 'https://image.example/a.jpg',
    videoUrls: ''
  }]);

  assert.deepEqual(rows[0], {
    '商品链接': 'https://shopee.sg/a.1.2',
    '站点': 'Singapore',
    '店铺ID': '1',
    '商品ID': '2',
    '评论人': 'buyer',
    '评分': 4,
    '评论内容': 'Nice',
    '规格/变体': 'Black',
    '评论时间': '2026-01-02 03:04:05',
    '图片链接': 'https://image.example/a.jpg',
    '视频链接': ''
  });
});

test('toJsonText omits internal createdAt and formats stable JSON', () => {
  const text = toJsonText([{ productUrl: 'u', createdAt: 1, comment: 'c' }]);
  assert.equal(text, '[\n  {\n    "productUrl": "u",\n    "comment": "c"\n  }\n]');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/export-format.test.js`

Expected: FAIL because `extension/shared/export-format.js` does not exist.

- [ ] **Step 3: Implement export formatting helpers**

```js
(function attachExportFormat(global) {
  function safePart(value) {
    return String(value || 'unknown').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  }

  function buildDownloadFilename(product, reviewCount, extension) {
    return [
      `shopee-${safePart(product.marketplaceCode)}`,
      '_',
      safePart(product.shopId),
      '_',
      safePart(product.itemId),
      '_',
      Number(reviewCount || 0),
      '-reviews.',
      extension
    ].join('');
  }

  function toExcelRows(rows) {
    return rows.map((row) => ({
      '商品链接': row.productUrl || '',
      '站点': row.marketplace || '',
      '店铺ID': row.shopId || '',
      '商品ID': row.itemId || '',
      '评论人': row.reviewerUsername || '',
      '评分': row.rating || '',
      '评论内容': row.comment || '',
      '规格/变体': row.modelName || '',
      '评论时间': row.reviewTime || '',
      '图片链接': row.imageUrls || '',
      '视频链接': row.videoUrls || ''
    }));
  }

  function toJsonRows(rows) {
    return rows.map(({ createdAt, ...row }) => row);
  }

  function toJsonText(rows) {
    return JSON.stringify(toJsonRows(rows), null, 2);
  }

  function jsonDataUrl(rows) {
    return `data:application/json;charset=utf-8,${encodeURIComponent(toJsonText(rows))}`;
  }

  const api = { buildDownloadFilename, toExcelRows, toJsonRows, toJsonText, jsonDataUrl };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ShopeeReviewExporter = Object.assign(global.ShopeeReviewExporter || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
```

- [ ] **Step 4: Run export format tests**

Run: `npm test -- tests/export-format.test.js`

Expected: PASS for all export format tests.

- [ ] **Step 5: Commit export formatting**

```bash
git add extension/shared/export-format.js tests/export-format.test.js
git commit -m "feat: format exported review files"
```

## Task 5: Manifest And Content Scanner

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/content/content.js`

- [ ] **Step 1: Create `extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Shopee Review Exporter",
  "version": "0.1.0",
  "description": "Scan the current tab for Shopee product links and export product reviews to Excel or JSON.",
  "permissions": [
    "activeTab",
    "tabs",
    "scripting",
    "downloads",
    "storage"
  ],
  "host_permissions": [
    "*://shopee.sg/*",
    "*://*.shopee.sg/*",
    "*://shopee.com.my/*",
    "*://*.shopee.com.my/*",
    "*://shopee.co.id/*",
    "*://*.shopee.co.id/*",
    "*://shopee.co.th/*",
    "*://*.shopee.co.th/*",
    "*://shopee.ph/*",
    "*://*.shopee.ph/*",
    "*://shopee.vn/*",
    "*://*.shopee.vn/*",
    "*://shopee.tw/*",
    "*://*.shopee.tw/*"
  ],
  "action": {
    "default_title": "Shopee Review Exporter",
    "default_popup": "popup/popup.html"
  },
  "background": {
    "service_worker": "background/service-worker.js"
  }
}
```

- [ ] **Step 2: Create `extension/content/content.js`**

```js
(function attachContentScanner(global) {
  function collectPageText() {
    const anchorText = Array.from(document.querySelectorAll('a[href]'))
      .map((anchor) => anchor.href)
      .join('\n');
    return `${anchorText}\n${document.body?.innerText || ''}`;
  }

  function scanCurrentPage() {
    const parser = global.ShopeeReviewExporter;
    const products = parser.extractShopeeProductLinks(collectPageText());
    return {
      pageUrl: location.href,
      pageTitle: document.title,
      products
    };
  }

  global.ShopeeReviewExporter = Object.assign(global.ShopeeReviewExporter || {}, { scanCurrentPage });
})(typeof globalThis !== 'undefined' ? globalThis : window);
```

- [ ] **Step 3: Copy vendored fflate into extension**

Run: `npm run prepare:vendor`

Expected: `extension/lib/fflate.min.js` exists.

- [ ] **Step 4: Validate manifest**

Run: `npm run validate:manifest`

Expected: PASS with `Manifest validation passed.`

- [ ] **Step 5: Commit manifest and content scanner**

```bash
git add extension/manifest.json extension/content/content.js extension/lib/fflate.min.js
git commit -m "feat: add extension manifest and scanner"
```

## Task 6: Popup UI

**Files:**
- Create: `extension/popup/popup.html`
- Create: `extension/popup/popup.css`
- Create: `extension/popup/popup.js`

- [ ] **Step 1: Create popup markup**

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Shopee 评论导出</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <main class="popup-shell">
    <header class="header">
      <h1>Shopee 评论导出</h1>
      <button id="scanButton" class="button secondary" type="button">扫描当前页</button>
    </header>

    <section class="settings" aria-label="导出设置">
      <label>
        导出格式
        <select id="formatSelect">
          <option value="xlsx">Excel (.xlsx)</option>
          <option value="json">JSON (.json)</option>
        </select>
      </label>

      <label>
        每个商品评论条数
        <input id="countInput" type="number" min="1" max="5000" value="100">
      </label>

      <label>
        评论筛选
        <select id="filterSelect">
          <option value="0">全部评论</option>
          <option value="1">带图/视频</option>
          <option value="5">5 星</option>
          <option value="4">4 星</option>
          <option value="3">3 星</option>
          <option value="2">2 星</option>
          <option value="11">1 星</option>
        </select>
      </label>
    </section>

    <section class="actions">
      <button id="startButton" class="button primary" type="button" disabled>开始导出</button>
      <button id="pauseButton" class="button secondary" type="button" disabled>暂停</button>
      <button id="stopButton" class="button danger" type="button" disabled>停止</button>
    </section>

    <section class="summary" id="summary">尚未扫描</section>
    <section class="task-list" id="taskList" aria-label="商品任务列表"></section>
    <footer class="status" id="status">就绪</footer>
  </main>

  <script src="../shared/shopee-sites.js"></script>
  <script src="../shared/url-parser.js"></script>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create popup styles**

```css
* {
  box-sizing: border-box;
}

body {
  width: 430px;
  margin: 0;
  color: #1f2933;
  background: #f7f8fa;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.popup-shell {
  padding: 14px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

h1 {
  margin: 0;
  color: #ee4d2d;
  font-size: 17px;
}

.settings {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e6e8eb;
  border-radius: 8px;
}

.settings label {
  display: grid;
  gap: 5px;
  font-weight: 600;
}

.settings label:first-child {
  grid-column: span 2;
}

select,
input {
  width: 100%;
  min-height: 32px;
  border: 1px solid #cfd6dd;
  border-radius: 6px;
  padding: 5px 8px;
  background: #fff;
  color: #1f2933;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin: 12px 0;
}

.button {
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 6px 10px;
  font-weight: 700;
  cursor: pointer;
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary {
  color: #fff;
  background: #ee4d2d;
}

.secondary {
  color: #1f2933;
  background: #fff;
  border-color: #cfd6dd;
}

.danger {
  color: #b42318;
  background: #fff;
  border-color: #f2b8b5;
}

.summary,
.status {
  color: #52616f;
  margin-bottom: 8px;
}

.task-list {
  display: grid;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
}

.task {
  padding: 10px;
  background: #fff;
  border: 1px solid #e6e8eb;
  border-radius: 8px;
}

.task-title {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-weight: 700;
}

.task-url {
  margin-top: 4px;
  color: #697987;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-progress {
  margin-top: 6px;
  color: #52616f;
}

.status-running {
  color: #ee4d2d;
}

.status-done {
  color: #16803c;
}

.status-failed,
.status-stopped {
  color: #b42318;
}
```

- [ ] **Step 3: Create popup behavior**

```js
const scanButton = document.getElementById('scanButton');
const startButton = document.getElementById('startButton');
const pauseButton = document.getElementById('pauseButton');
const stopButton = document.getElementById('stopButton');
const formatSelect = document.getElementById('formatSelect');
const countInput = document.getElementById('countInput');
const filterSelect = document.getElementById('filterSelect');
const summary = document.getElementById('summary');
const taskList = document.getElementById('taskList');
const status = document.getElementById('status');

let products = [];
let paused = false;

scanButton.addEventListener('click', scanCurrentTab);
startButton.addEventListener('click', startExport);
pauseButton.addEventListener('click', togglePause);
stopButton.addEventListener('click', stopExport);
chrome.runtime.onMessage.addListener(handleBackgroundMessage);

restoreSettings();
requestState();

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('找不到当前标签页');
  return tab;
}

async function scanCurrentTab() {
  try {
    status.textContent = '正在扫描当前页...';
    const tab = await getActiveTab();
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['shared/shopee-sites.js', 'shared/url-parser.js', 'content/content.js']
    });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.ShopeeReviewExporter.scanCurrentPage()
    });
    products = result?.result?.products || [];
    renderProducts(products.map((product) => ({ ...product, status: 'pending', fetched: 0, target: getSettings().count })));
    summary.textContent = `找到 ${products.length} 个 Shopee 商品链接`;
    status.textContent = products.length ? '扫描完成' : '当前页没有可识别的 Shopee 商品链接';
    startButton.disabled = products.length === 0;
  } catch (error) {
    status.textContent = `扫描失败：${error.message}`;
  }
}

function getSettings() {
  return {
    format: formatSelect.value,
    count: Math.max(1, Math.min(5000, Number(countInput.value || 100))),
    filter: Number(filterSelect.value || 0)
  };
}

function saveSettings() {
  chrome.storage.local.set({ exportSettings: getSettings() });
}

async function restoreSettings() {
  const { exportSettings } = await chrome.storage.local.get('exportSettings');
  if (!exportSettings) return;
  formatSelect.value = exportSettings.format || 'xlsx';
  countInput.value = exportSettings.count || 100;
  filterSelect.value = String(exportSettings.filter ?? 0);
}

async function startExport() {
  const settings = getSettings();
  saveSettings();
  paused = false;
  pauseButton.textContent = '暂停';
  startButton.disabled = true;
  pauseButton.disabled = false;
  stopButton.disabled = false;
  status.textContent = '正在开始导出...';
  await chrome.runtime.sendMessage({ type: 'START_EXPORT', products, settings });
}

async function togglePause() {
  paused = !paused;
  pauseButton.textContent = paused ? '继续' : '暂停';
  await chrome.runtime.sendMessage({ type: paused ? 'PAUSE_EXPORT' : 'RESUME_EXPORT' });
}

async function stopExport() {
  await chrome.runtime.sendMessage({ type: 'STOP_EXPORT' });
  startButton.disabled = products.length === 0;
  pauseButton.disabled = true;
  stopButton.disabled = true;
}

async function requestState() {
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' }).catch(() => null);
  if (state?.tasks?.length) renderProducts(state.tasks);
}

function handleBackgroundMessage(message) {
  if (message.type === 'EXPORT_STATE') {
    renderProducts(message.state.tasks);
    status.textContent = message.state.message || '正在处理';
    startButton.disabled = message.state.running;
    pauseButton.disabled = !message.state.running;
    stopButton.disabled = !message.state.running;
  }
}

function renderProducts(tasks) {
  taskList.innerHTML = '';
  for (const task of tasks) {
    const item = document.createElement('article');
    item.className = 'task';
    item.innerHTML = `
      <div class="task-title">
        <span>${task.marketplaceCode || task.marketplace} / ${task.shopId}.${task.itemId}</span>
        <span class="status-${task.status}">${statusLabel(task.status)}</span>
      </div>
      <div class="task-url" title="${escapeHtml(task.url)}">${escapeHtml(task.url)}</div>
      <div class="task-progress">${task.fetched || 0}/${task.target || getSettings().count} 条${task.error ? ` · ${escapeHtml(task.error)}` : ''}</div>
    `;
    taskList.appendChild(item);
  }
}

function statusLabel(value) {
  return {
    pending: '等待',
    running: '导出中',
    done: '完成',
    failed: '失败',
    stopped: '已停止'
  }[value] || value;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}
```

- [ ] **Step 4: Commit popup UI**

```bash
git add extension/popup/popup.html extension/popup/popup.css extension/popup/popup.js
git commit -m "feat: add popup export workflow"
```

## Task 7: Background Queue And Review Fetching

**Files:**
- Create: `extension/background/service-worker.js`

- [ ] **Step 1: Create background service worker**

```js
importScripts(
  '../lib/fflate.min.js',
  '../shared/shopee-sites.js',
  '../shared/reviews.js',
  '../shared/export-format.js'
);

const DEFAULT_LIMIT = 50;
const PAGE_LOAD_TIMEOUT_MS = 30000;
const RUNTIME_SETTLE_MS = 5000;

let state = {
  running: false,
  paused: false,
  stopped: false,
  currentTabId: null,
  tasks: [],
  message: '就绪'
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_EXPORT') {
    startExport(message.products || [], message.settings || {});
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'PAUSE_EXPORT') {
    state.paused = true;
    state.message = '已暂停';
    publishState();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'RESUME_EXPORT') {
    state.paused = false;
    state.message = '继续导出';
    publishState();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'STOP_EXPORT') {
    stopExport();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'GET_STATE') {
    sendResponse(snapshotState());
    return true;
  }

  return false;
});

function startExport(products, settings) {
  state = {
    running: true,
    paused: false,
    stopped: false,
    currentTabId: null,
    tasks: products.map((product, index) => ({
      ...product,
      id: `${product.key}:${index}`,
      status: 'pending',
      fetched: 0,
      target: clampCount(settings.count),
      filter: Number(settings.filter || 0),
      format: settings.format === 'json' ? 'json' : 'xlsx',
      error: ''
    })),
    message: `准备导出 ${products.length} 个商品`
  };
  publishState();
  runQueue();
}

async function stopExport() {
  state.stopped = true;
  state.paused = false;
  state.running = false;
  state.message = '已停止';
  for (const task of state.tasks) {
    if (task.status === 'pending' || task.status === 'running') task.status = 'stopped';
  }
  if (state.currentTabId) {
    await chrome.tabs.remove(state.currentTabId).catch(() => {});
    state.currentTabId = null;
  }
  publishState();
}

async function runQueue() {
  for (const task of state.tasks) {
    if (state.stopped) break;
    await waitWhilePaused();
    if (state.stopped) break;

    task.status = 'running';
    state.message = `正在导出 ${task.marketplace} ${task.shopId}.${task.itemId}`;
    publishState();

    try {
      await processTask(task);
      task.status = 'done';
      state.message = `已完成 ${task.shopId}.${task.itemId}`;
    } catch (error) {
      task.status = state.stopped ? 'stopped' : 'failed';
      task.error = error.message || String(error);
      state.message = `导出失败：${task.error}`;
    } finally {
      await closeCurrentTab();
      publishState();
    }
  }

  state.running = false;
  state.message = state.stopped ? '已停止' : '全部任务完成';
  publishState();
}

async function processTask(task) {
  const tab = await chrome.tabs.create({ url: task.url, active: false });
  state.currentTabId = tab.id;
  await waitForTabComplete(tab.id);
  await sleep(RUNTIME_SETTLE_MS);

  const rawReviews = [];
  let offset = 0;

  while (rawReviews.length < task.target) {
    if (state.stopped) throw new Error('已停止');
    await waitWhilePaused();

    const payload = await fetchReviewPage(tab.id, task, offset, DEFAULT_LIMIT);
    const pageReviews = payload?.data?.ratings || [];
    if (!Array.isArray(pageReviews) || pageReviews.length === 0) break;

    rawReviews.push(...pageReviews);
    task.fetched = Math.min(rawReviews.length, task.target);
    publishState();

    if (pageReviews.length < DEFAULT_LIMIT) break;
    offset += DEFAULT_LIMIT;
    await sleep(800);
  }

  const limitedReviews = rawReviews.slice(0, task.target);
  const rows = ShopeeReviewExporter.normalizeReviewsForExport(task, limitedReviews);
  await downloadRows(task, rows);
}

async function fetchReviewPage(tabId, task, offset, limit) {
  const apiPath = `/api/v2/item/get_ratings?exclude_filter=1&filter=${encodeURIComponent(task.filter)}&filter_size=0&flag=1&fold_filter=0&itemid=${encodeURIComponent(task.itemId)}&limit=${limit}&offset=${offset}&relevant_reviews=false&request_source=2&shopid=${encodeURIComponent(task.shopId)}&tag_filter=&type=0`;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (url) => {
      const response = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    args: [apiPath]
  });
  if (!result?.result) throw new Error('评论接口没有返回数据');
  return result.result;
}

async function downloadRows(task, rows) {
  const extension = task.format === 'json' ? 'json' : 'xlsx';
  const filename = ShopeeReviewExporter.buildDownloadFilename(task, rows.length, extension);
  const url = task.format === 'json' ? ShopeeReviewExporter.jsonDataUrl(rows) : excelDataUrl(rows);
  await chrome.downloads.download({ url, filename, saveAs: false });
}

function excelDataUrl(rows) {
  const rowsForExcel = ShopeeReviewExporter.toExcelRows(rows);
  const headers = rowsForExcel.length ? Object.keys(rowsForExcel[0]) : [
    '商品链接',
    '站点',
    '店铺ID',
    '商品ID',
    '评论人',
    '评分',
    '评论内容',
    '规格/变体',
    '评论时间',
    '图片链接',
    '视频链接'
  ];
  const sheetRows = [headers, ...rowsForExcel.map((row) => headers.map((header) => row[header] ?? ''))];
  const files = buildXlsxFiles(sheetRows);
  const zipped = fflate.zipSync(files);
  const base64 = uint8ToBase64(zipped);
  return `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
}

function buildXlsxFiles(sheetRows) {
  return {
    '[Content_Types].xml': fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    '_rels/.rels': fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/_rels/workbook.xml.rels': fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/workbook.xml': fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Reviews" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`),
    'xl/styles.xml': fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`),
    'xl/worksheets/sheet1.xml': fflate.strToU8(buildWorksheetXml(sheetRows))
  };
}

function buildWorksheetXml(rows) {
  const columnWidths = [36, 14, 14, 14, 18, 8, 48, 24, 20, 48, 48]
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join('');
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${columnWidths}</cols>
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

function columnName(number) {
  let name = '';
  while (number > 0) {
    const modulo = (number - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    number = Math.floor((number - modulo) / 26);
  }
  return name;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function uint8ToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function waitForTabComplete(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'complete') return;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('商品页加载超时'));
    }, PAGE_LOAD_TIMEOUT_MS);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function waitWhilePaused() {
  while (state.paused && !state.stopped) {
    await sleep(300);
  }
}

async function closeCurrentTab() {
  if (!state.currentTabId) return;
  await chrome.tabs.remove(state.currentTabId).catch(() => {});
  state.currentTabId = null;
}

function clampCount(value) {
  return Math.max(1, Math.min(5000, Number(value || 100)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function snapshotState() {
  return {
    running: state.running,
    paused: state.paused,
    tasks: state.tasks,
    message: state.message
  };
}

function publishState() {
  chrome.runtime.sendMessage({ type: 'EXPORT_STATE', state: snapshotState() }).catch(() => {});
}
```

- [ ] **Step 2: Run all code-level tests**

Run: `npm test`

Expected: PASS for URL parser, review normalization, and export format tests.

- [ ] **Step 3: Validate manifest**

Run: `npm run validate:manifest`

Expected: PASS with `Manifest validation passed.`

- [ ] **Step 4: Commit background worker**

```bash
git add extension/background/service-worker.js
git commit -m "feat: export reviews from background queue"
```

## Task 8: Verification And Manual QA

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run full automated verification**

Run: `npm run verify`

Expected: all tests pass and manifest validation passes.

- [ ] **Step 2: Add manual QA notes to `README.md`**

```markdown
## Manual QA Checklist

- Scan a normal webpage that contains multiple Shopee product links.
- Confirm duplicate Shopee links appear only once.
- Export Excel with the default count of 100 reviews.
- Export JSON with a smaller count such as 5 reviews.
- Confirm exported reviews are sorted newest to oldest by review time.
- Confirm each product downloads as a separate file.
- Confirm pause stops progress before the next API page or next product.
- Confirm stop closes the current background product tab.
- Confirm a failed product shows an error and later products continue.
```

- [ ] **Step 3: Run full automated verification again**

Run: `npm run verify`

Expected: all tests pass and manifest validation passes.

- [ ] **Step 4: Commit verification docs**

```bash
git add README.md
git commit -m "docs: add manual QA checklist"
```

## Self-Review Notes

Spec coverage:

- Current-tab Shopee product scanning is covered by Tasks 2, 5, and 6.
- Supported marketplaces are covered by Tasks 2 and 5.
- Excel and JSON export are covered by Tasks 1, 4, and 7.
- One file per product is covered by Tasks 4 and 7.
- Configurable review count and filters are covered by Tasks 6 and 7.
- Newest-to-oldest sorting is covered by Task 3 and Task 7.
- Pause, resume, stop, and per-product status are covered by Tasks 6 and 7.
- Manual and code-level testing are covered by Tasks 2, 3, 4, 5, 7, and 8.

Placeholder scan:

- The plan contains no unfilled sections.
- All code-creation steps include concrete file contents.

Type consistency:

- Product objects consistently use `url`, `domain`, `marketplace`, `marketplaceCode`, `shopId`, `itemId`, and `key`.
- Review rows consistently use `productUrl`, `marketplace`, `domain`, `shopId`, `itemId`, `reviewerUsername`, `rating`, `comment`, `modelName`, `reviewTime`, `createdAt`, `imageUrls`, and `videoUrls`.
- Popup and background message types consistently use `START_EXPORT`, `PAUSE_EXPORT`, `RESUME_EXPORT`, `STOP_EXPORT`, `GET_STATE`, and `EXPORT_STATE`.
