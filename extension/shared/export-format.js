(function attachExportFormat(global) {
  function safePart(value) {
    return String(value || 'unknown').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  }

  function buildDownloadFilename(product, reviewCount, extension) {
    return [
      `shopee-${safePart(product.marketplaceCode)}`,
      '_',
      safePart(product.shopId),
      '_',
      safePart(product.itemId),
      '_',
      Number(reviewCount || 0),
      '-reviews.',
      extension
    ].join('');
  }

  function toExcelRows(rows) {
    return rows.map((row) => ({
      '商品链接': row.productUrl || '',
      '站点': row.marketplace || '',
      '店铺ID': row.shopId || '',
      '商品ID': row.itemId || '',
      '评论人': row.reviewerUsername || '',
      '评分': row.rating || '',
      '评论内容': row.comment || '',
      '规格/变体': row.modelName || '',
      '评论时间': row.reviewTime || '',
      '图片链接': row.imageUrls || '',
      '视频链接': row.videoUrls || ''
    }));
  }

  function toJsonRows(rows) {
    return rows.map(({ createdAt, ...row }) => row);
  }

  function toJsonText(rows) {
    return JSON.stringify(toJsonRows(rows), null, 2);
  }

  function jsonDataUrl(rows) {
    return `data:application/json;charset=utf-8,${encodeURIComponent(toJsonText(rows))}`;
  }

  const api = { buildDownloadFilename, toExcelRows, toJsonRows, toJsonText, jsonDataUrl };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ShopeeReviewExporter = Object.assign(global.ShopeeReviewExporter || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
