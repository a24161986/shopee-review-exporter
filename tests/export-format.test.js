const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDownloadFilename,
  jsonDataUrl,
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

test('buildDownloadFilename sanitizes empty parts and unsafe extensions', () => {
  const filename = buildDownloadFilename({
    marketplaceCode: '///',
    shopId: '中文',
    itemId: '456'
  }, 1, '../json');

  assert.equal(filename, 'shopee-unknown_unknown_456_1-reviews.json');
  assert.equal(filename.includes('/'), false);
  assert.equal(filename.includes('..'), false);
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

test('jsonDataUrl encodes formatted JSON text', () => {
  const rows = [{ productUrl: 'u', comment: '中文\n"quoted"', createdAt: 1 }];
  const dataUrl = jsonDataUrl(rows);
  const prefix = 'data:application/json;charset=utf-8,';

  assert.equal(dataUrl.startsWith(prefix), true);
  assert.equal(decodeURIComponent(dataUrl.slice(prefix.length)), toJsonText(rows));
});
