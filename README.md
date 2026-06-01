# Shopee Review Exporter

Chrome extension for scanning the current tab for Shopee product links and exporting each product's reviews to Excel or JSON.

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

1. Open a page that contains Shopee product links.
2. Open the extension popup.
3. Click Scan Current Tab.
4. Choose export format, review count, and review filter.
5. Click Start Export.

## Manual QA Checklist

- Scan a normal webpage that contains multiple Shopee product links.
- Confirm duplicate Shopee links appear only once.
- Export Excel with the default count of 100 reviews.
- Export JSON with a smaller count such as 5 reviews.
- Confirm exported reviews are sorted newest to oldest by review time.
- Confirm each product downloads as a separate file.
- Confirm pause stops progress before the next API page or next product.
- Confirm stop closes the current background product tab.
- Confirm a failed product shows an error and later products continue.
