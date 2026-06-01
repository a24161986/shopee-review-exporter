const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWorksheetXml } = require('../extension/shared/xlsx-export.js');

test('buildWorksheetXml strips XML 1.0 illegal controls and escapes text', () => {
  const xml = buildWorksheetXml([['bad\u0000\u000B text & <tag>']]);

  assert.equal(xml.includes('\u0000'), false);
  assert.equal(xml.includes('\u000B'), false);
  assert.equal(xml.includes('bad text &amp; &lt;tag&gt;'), true);
});
