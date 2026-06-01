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
