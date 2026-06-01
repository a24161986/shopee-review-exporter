(function attachReviewFilter(global) {
  const semanticFilters = new Set(['all', 'media', 'star-5', 'star-4', 'star-3', 'star-2', 'star-1']);
  const legacyFilters = {
    0: 'all',
    1: 'media',
    5: 'star-5',
    4: 'star-4',
    3: 'star-3',
    2: 'star-2',
    11: 'star-1'
  };
  const shopeeParams = {
    all: { filter: 0, type: 0 },
    media: { filter: 3, type: 0 },
    'star-5': { filter: 0, type: 5 },
    'star-4': { filter: 0, type: 4 },
    'star-3': { filter: 0, type: 3 },
    'star-2': { filter: 0, type: 2 },
    'star-1': { filter: 0, type: 1 }
  };

  function normalizeReviewFilterValue(value) {
    const reviewFilter = String(value ?? '').trim();
    return semanticFilters.has(reviewFilter) ? reviewFilter : 'all';
  }

  function resolveReviewFilter(value) {
    const rawValue = String(value ?? '').trim();
    const reviewFilter = semanticFilters.has(rawValue)
      ? rawValue
      : legacyFilters[rawValue] || 'all';
    const params = shopeeParams[reviewFilter];

    return {
      reviewFilter,
      filter: params.filter,
      type: params.type
    };
  }

  const api = { normalizeReviewFilterValue, resolveReviewFilter };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ShopeeReviewExporter = Object.assign(global.ShopeeReviewExporter || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
