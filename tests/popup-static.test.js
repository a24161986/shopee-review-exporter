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
