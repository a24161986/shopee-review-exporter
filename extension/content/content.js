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
    const products = parser.extractShopeeProductLinks(collectPageText());
    return {
      pageUrl: location.href,
      pageTitle: document.title,
      products
    };
  }

  global.ShopeeReviewExporter = Object.assign(global.ShopeeReviewExporter || {}, { scanCurrentPage });
})(typeof globalThis !== 'undefined' ? globalThis : window);
