(function attachContentScanner(global) {
  function collectPageText() {
    const currentUrl = location?.href || '';
    const anchorText = Array.from(document.querySelectorAll('a[href]'))
      .map((anchor) => anchor.href)
      .join('\n');
    return `${currentUrl}\n${anchorText}\n${document.body?.innerText || ''}`;
  }

  function scanCurrentPage() {
    const parser = global.ShopeeReviewExporter;
    const currentProduct = parser.parseShopeeProductUrl(location.href);
    const products = currentProduct
      ? [currentProduct]
      : parser.extractShopeeProductLinks(collectPageText());
    return {
      pageUrl: location.href,
      pageTitle: document.title,
      products
    };
  }

  global.ShopeeReviewExporter = Object.assign(global.ShopeeReviewExporter || {}, { scanCurrentPage });
})(typeof globalThis !== 'undefined' ? globalThis : window);
