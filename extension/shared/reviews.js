(function attachReviews(global) {
  const siteApi = typeof require === 'function'
    ? require('./shopee-sites.js')
    : global.ShopeeReviewExporter;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function formatUnixTime(seconds) {
    if (!seconds) return '';
    const date = new Date(seconds * 1000);
    return [
      date.getUTCFullYear(),
      '-',
      pad(date.getUTCMonth() + 1),
      '-',
      pad(date.getUTCDate()),
      ' ',
      pad(date.getUTCHours()),
      ':',
      pad(date.getUTCMinutes()),
      ':',
      pad(date.getUTCSeconds())
    ].join('');
  }

  function getModelName(rawReview) {
    const productItems = Array.isArray(rawReview.product_items) ? rawReview.product_items : [];
    return productItems[0]?.model_name || '';
  }

  function getImageUrls(product, rawReview) {
    const images = Array.isArray(rawReview.images) ? rawReview.images : [];
    const market = siteApi.getMarketByDomain(product.domain);
    const imageHost = market?.imageHost || 'down-ws.img.susercontent.com';
    return images
      .map((image) => {
        if (!image) return '';
        if (/^https?:\/\//i.test(image)) return image;
        return `https://${imageHost}/file/${image}`;
      })
      .filter(Boolean)
      .join('\n');
  }

  function getVideoUrls(rawReview) {
    const videos = Array.isArray(rawReview.videos) ? rawReview.videos : [];
    return videos
      .map((video) => video?.url || '')
      .filter(Boolean)
      .join('\n');
  }

  function normalizeReview(product, rawReview) {
    const createdAt = Number(rawReview.ctime || 0);
    return {
      productUrl: product.url,
      marketplace: product.marketplace,
      domain: product.domain,
      shopId: product.shopId,
      itemId: product.itemId,
      reviewerUsername: rawReview.author_username || '',
      rating: rawReview.rating_star || '',
      comment: rawReview.comment || '',
      modelName: getModelName(rawReview),
      reviewTime: formatUnixTime(createdAt),
      createdAt,
      imageUrls: getImageUrls(product, rawReview),
      videoUrls: getVideoUrls(rawReview)
    };
  }

  function sortReviewsNewestFirst(rows) {
    return [...rows].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  function normalizeReviewsForExport(product, rawReviews) {
    return sortReviewsNewestFirst((rawReviews || []).map((rawReview) => normalizeReview(product, rawReview)));
  }

  const api = { formatUnixTime, normalizeReview, normalizeReviewsForExport, sortReviewsNewestFirst };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ShopeeReviewExporter = Object.assign(global.ShopeeReviewExporter || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
