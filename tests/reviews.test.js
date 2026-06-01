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
