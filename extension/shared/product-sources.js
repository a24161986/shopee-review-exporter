(function attachProductSources(global) {
  const parser = typeof require === 'function'
    ? require('./url-parser.js')
    : global.ShopeeReviewExporter;

  const SOURCE_ORDER = ['tab', 'paste'];
  const SOURCE_LABELS = {
    tab: '标签页',
    paste: '粘贴'
  };

  function normalizeSources(sources) {
    const seen = new Set(Array.isArray(sources) ? sources : []);
    return SOURCE_ORDER.filter((source) => seen.has(source));
  }

  function sourceLabel(sources) {
    const normalized = normalizeSources(sources);
    return normalized.map((source) => SOURCE_LABELS[source]).join('/') || '';
  }

  function withSource(product, source, extra = {}) {
    const sources = normalizeSources([source]);
    return {
      ...product,
      ...extra,
      sources,
      source: sourceLabel(sources)
    };
  }

  function mergeProductSources(existingProducts = [], incomingProducts = []) {
    const byKey = new Map();

    for (const product of [...existingProducts, ...incomingProducts]) {
      if (!product?.key) continue;

      const previous = byKey.get(product.key);
      if (!previous) {
        const sources = normalizeSources(product.sources || []);
        byKey.set(product.key, {
          ...product,
          sources,
          source: sourceLabel(sources)
        });
        continue;
      }

      const sources = normalizeSources([...(previous.sources || []), ...(product.sources || [])]);
      byKey.set(product.key, {
        ...previous,
        sources,
        source: sourceLabel(sources)
      });
    }

    return Array.from(byKey.values());
  }

  function productsFromTabs(tabs = []) {
    const products = [];
    for (const tab of tabs) {
      const product = parser.parseShopeeProductUrl(tab?.url);
      if (!product) continue;
      products.push(withSource(product, 'tab', {
        tabId: tab.id,
        tabTitle: tab.title || ''
      }));
    }
    return mergeProductSources([], products);
  }

  function productsFromPastedText(text) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const imported = [];
    let ignoredCount = 0;

    for (const line of lines) {
      const products = parser.extractShopeeProductLinks(line);
      if (products.length === 0) {
        ignoredCount += 1;
        continue;
      }

      for (const product of products) {
        imported.push(withSource(product, 'paste'));
      }
    }

    const products = mergeProductSources([], imported);
    return {
      products,
      importedCount: products.length,
      ignoredCount
    };
  }

  const api = {
    productsFromTabs,
    productsFromPastedText,
    mergeProductSources,
    sourceLabel
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ShopeeReviewExporter = Object.assign(global.ShopeeReviewExporter || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
