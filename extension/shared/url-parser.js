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
