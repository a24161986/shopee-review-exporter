const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('popup uses product source helpers instead of deleted content scanner', () => {
  const popupJs = fs.readFileSync(path.join(root, 'extension/popup/popup.js'), 'utf8');
  const popupHtml = fs.readFileSync(path.join(root, 'extension/popup/popup.html'), 'utf8');
  const deletedScannerPath = ['content', 'content.js'].join('/');
  const deletedScannerFunction = ['scan', 'CurrentPage'].join('');

  assert.equal(popupJs.includes(deletedScannerPath), false);
  assert.equal(popupJs.includes(deletedScannerFunction), false);
  assert.equal(popupJs.includes('chrome.tabs.query({ currentWindow: true })'), true);
  assert.equal(popupJs.includes('ShopeeReviewExporter.productsFromTabs(tabs)'), true);

  const productSourcesScript = popupHtml.indexOf('../shared/product-sources.js');
  const popupScript = popupHtml.indexOf('popup.js');
  assert.notEqual(productSourcesScript, -1);
  assert.ok(productSourcesScript < popupScript);
});

test('popup exposes current window scan pasted import and retry controls', () => {
  const popupHtml = fs.readFileSync(path.join(root, 'extension/popup/popup.html'), 'utf8');
  const controlIds = [
    'scanWindowButton',
    'pasteInput',
    'importLinksButton',
    'clearPasteButton',
    'retryFailedButton'
  ];

  for (const id of controlIds) {
    assert.match(popupHtml, new RegExp(`id="${id}"`));
  }

  assert.equal(popupHtml.includes('id="scanButton"'), false);
  assert.equal(popupHtml.includes('识别当前窗口商品页'), true);
  assert.equal(popupHtml.includes('尚未识别商品'), true);

  const scriptOrder = [
    '../shared/shopee-sites.js',
    '../shared/url-parser.js',
    '../shared/review-filter.js',
    '../shared/product-sources.js',
    '../shared/task-state.js',
    'popup.js'
  ].map((script) => popupHtml.indexOf(script));

  assert.equal(scriptOrder.every((index) => index !== -1), true);
  assert.deepEqual([...scriptOrder].sort((a, b) => a - b), scriptOrder);
});

test('popup behavior imports pasted links retries failed tasks and uses shared task labels', () => {
  const popupJs = fs.readFileSync(path.join(root, 'extension/popup/popup.js'), 'utf8');

  assert.equal(popupJs.includes('scanWindowButton.addEventListener'), true);
  assert.equal(popupJs.includes('scanCurrentWindowTabs'), true);
  assert.equal(popupJs.includes('ShopeeReviewExporter.productsFromPastedText(pasteInput.value)'), true);
  assert.equal(popupJs.includes('ShopeeReviewExporter.mergeProductSources(products, result.products)'), true);
  assert.equal(popupJs.includes("type: 'RETRY_FAILED'"), true);
  assert.equal(popupJs.includes('ShopeeReviewExporter.statusLabel(task.status)'), true);
  assert.equal(popupJs.includes('ShopeeReviewExporter.normalizeTaskStatus(value)'), true);
  assert.equal(popupJs.includes('status-stopped'), false);
  assert.equal(popupJs.includes('已停止'), false);
  assert.equal(popupJs.includes('完成'), false);
});

test('popup hardens background command responses and retry control refresh', () => {
  const popupJs = fs.readFileSync(path.join(root, 'extension/popup/popup.js'), 'utf8');

  assert.equal(popupJs.includes('function isBackgroundCommand(type)'), true);
  assert.equal(popupJs.includes('return { ok: value?.ok === true, value };'), true);
  assert.match(popupJs, /async function retryFailed\(\) \{[\s\S]*backgroundRunning = true;[\s\S]*updateControls\(\);[\s\S]*if \(!response\.ok\) \{[\s\S]*backgroundRunning = false;[\s\S]*updateControls\(\);[\s\S]*return;[\s\S]*\}[\s\S]*updateControls\(\);[\s\S]*\}/);
});

test('popup disables product source controls while export is running', () => {
  const popupJs = fs.readFileSync(path.join(root, 'extension/popup/popup.js'), 'utf8');

  assert.match(popupJs, /async function scanCurrentWindowTabs\(\) \{\n  if \(backgroundRunning\) return;/);
  assert.match(popupJs, /function importPastedLinks\(\) \{\n  if \(backgroundRunning\) return;/);
  assert.match(popupJs, /clearPasteButton\.addEventListener\('click', \(\) => \{\n  if \(backgroundRunning\) return;/);
  assert.equal(popupJs.includes('scanWindowButton.disabled = backgroundRunning;'), true);
  assert.equal(popupJs.includes('pasteInput.disabled = backgroundRunning;'), true);
  assert.equal(popupJs.includes('importLinksButton.disabled = backgroundRunning;'), true);
  assert.equal(popupJs.includes('clearPasteButton.disabled = backgroundRunning;'), true);
});

test('popup summary and manifest description match current window import behavior', () => {
  const popupJs = fs.readFileSync(path.join(root, 'extension/popup/popup.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));

  assert.equal(popupJs.includes("if (summaryCounts.total === 0) return '尚未识别商品';"), true);
  assert.match(manifest.description, /current window/i);
  assert.match(manifest.description, /pasted links/i);
  assert.equal(manifest.description.includes('current tab'), false);
});

test('popup manifest no longer requests activeTab permission', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
  const validator = fs.readFileSync(path.join(root, 'scripts/validate-manifest.js'), 'utf8');

  assert.equal(manifest.permissions.includes('activeTab'), false);
  assert.deepEqual(manifest.permissions, [
    'tabs',
    'scripting',
    'downloads',
    'storage',
    'alarms'
  ]);
  assert.equal(validator.includes("assert.ok(manifest.permissions.includes('activeTab'))"), false);
  assert.equal(validator.includes("assert.equal(manifest.permissions.includes('activeTab'), false)"), true);
});
