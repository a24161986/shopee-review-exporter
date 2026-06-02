# Shopee Review Exporter

Chrome extension for identifying Shopee product detail tabs in the current Chrome window, importing pasted product links, and exporting each product's reviews to Excel or JSON.

## Development

```bash
npm install
npm run prepare:vendor
npm run verify
```

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `extension` folder.

## Usage

1. Open one or more Shopee product detail pages in the same Chrome window.
2. Open the extension popup.
3. Click `识别当前窗口商品页`.
4. Optionally paste extra Shopee product links into `粘贴商品链接` and click `导入链接`.
5. Choose export format, review count, and review filter.
6. Click `开始导出`.
7. Review the task list for `成功` and `失败`.
8. Click `重试失败项` to rerun only failed products.

## Manual QA Checklist

See [docs/manual-qa.md](docs/manual-qa.md).
