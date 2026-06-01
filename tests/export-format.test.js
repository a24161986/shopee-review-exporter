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
