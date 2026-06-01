# Shopee Review Exporter

Chrome extension for scanning the current tab for Shopee product links and exporting each product's reviews to Excel or JSON.

## Development

```bash
npm install
npm run prepare:xlsx
npm run verify
```

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `extension` folder.

## Usage

1. Open a page that contains Shopee product links.
2. Open the extension popup.
3. Click Scan Current Tab.
4. Choose export format, review count, and review filter.
5. Click Start Export.
