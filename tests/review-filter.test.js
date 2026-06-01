const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeReviewFilterValue,
  resolveReviewFilter
} = require('../extension/shared/review-filter.js');

test('normalizeReviewFilterValue keeps known semantic values', () => {
  assert.equal(normalizeReviewFilterValue('all'), 'all');
  assert.equal(normalizeReviewFilterValue('media'), 'media');
  assert.equal(normalizeReviewFilterValue('star-5'), 'star-5');
  assert.equal(normalizeReviewFilterValue('star-1'), 'star-1');
});

test('normalizeReviewFilterValue falls back to all for unknown values', () => {
  assert.equal(normalizeReviewFilterValue('unknown'), 'all');
  assert.equal(normalizeReviewFilterValue(5), 'all');
});

test('resolveReviewFilter maps semantic values to Shopee API params', () => {
  assert.deepEqual(resolveReviewFilter('all'), { reviewFilter: 'all', filter: 0, type: 0 });
  assert.deepEqual(resolveReviewFilter('media'), { reviewFilter: 'media', filter: 3, type: 0 });
  assert.deepEqual(resolveReviewFilter('star-5'), { reviewFilter: 'star-5', filter: 0, type: 5 });
  assert.deepEqual(resolveReviewFilter('star-1'), { reviewFilter: 'star-1', filter: 0, type: 1 });
});

test('resolveReviewFilter supports legacy popup filter values', () => {
  assert.deepEqual(resolveReviewFilter(1), { reviewFilter: 'media', filter: 3, type: 0 });
  assert.deepEqual(resolveReviewFilter(11), { reviewFilter: 'star-1', filter: 0, type: 1 });
});

test('resolveReviewFilter falls back to all for unknown values', () => {
  assert.deepEqual(resolveReviewFilter('unknown'), { reviewFilter: 'all', filter: 0, type: 0 });
});
