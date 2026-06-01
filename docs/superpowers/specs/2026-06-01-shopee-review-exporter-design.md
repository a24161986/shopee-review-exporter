# Shopee Review Exporter Design

## Goal

Build a new Chrome extension that scans the current browser tab for Shopee product links, then exports each product's reviews into a separate Excel or JSON file.

The first version targets these Shopee marketplaces:

- Singapore: `shopee.sg`.
- Malaysia: `shopee.com.my`.
- Indonesia: `shopee.co.id`.
- Thailand: `shopee.co.th`.
- Philippines: `shopee.ph`.
- Vietnam: `shopee.vn`.
- Taiwan: `shopee.tw`.

## User Flow

1. User opens any page that contains Shopee product links.
2. User opens the extension popup and clicks scan.
3. The extension lists unique Shopee product links found in the current tab.
4. User chooses export settings:
   - Export format: Excel or JSON.
   - Review count per product.
   - Review filter, such as all reviews, media reviews, or star rating.
5. User starts the batch export.
6. The extension processes products one by one.
7. Each product produces one downloaded file.

## Architecture

The extension uses Chrome Manifest V3.

Main parts:

- `manifest.json`: declares permissions, host access, popup, content script, and background service worker.
- Popup UI: provides scan, settings, task list, progress, pause, stop, and error display.
- Content script: scans the active tab's DOM for Shopee product links and returns parsed product candidates.
- Background service worker: owns the task queue, opens product pages in background tabs, fetches reviews, sorts data, generates files, and starts downloads.
- Export utilities: convert normalized review rows into Excel or JSON.

Default settings:

- Export format: Excel.
- Review count per product: 100.
- Review filter: all reviews.

## Link Detection

The content script scans anchor tags and plain page text for Shopee product URLs.

Supported product URL patterns:

- Dot format: `https://shopee.<site>/<slug>.<shopId>.<itemId>`
- Product path format: `https://shopee.<site>/product/<shopId>/<itemId>`

The scanner normalizes URLs, deduplicates by marketplace, shop ID, and item ID, then sends the product list to the popup.

## Review Fetching

The background service worker processes one product at a time.

For each product:

1. Open the product URL in an inactive tab.
2. Wait until the page finishes loading.
3. Wait briefly for Shopee's page runtime to initialize.
4. Use `chrome.scripting.executeScript` in the product page to call Shopee's review API.
5. Fetch reviews page by page until the configured review count is reached or the API has no more reviews.
6. Close the background tab.

This approach reuses the product page environment, including cookies and page runtime behavior, which is more reliable than direct background API calls.

Pause stops the queue before the next API page or next product. Stop ends the queue and closes the current background product tab when possible.

## Data Model

Each exported review row contains:

- Product URL.
- Marketplace.
- Shop ID.
- Item ID.
- Reviewer username.
- Rating.
- Review content.
- Model or variation name.
- Review time.
- Image URLs.
- Video URLs.

Rows are sorted by review creation time from newest to oldest before export.

## Export Behavior

Each product creates one file.

Filename format:

```text
shopee-<marketplace>_<shopId>_<itemId>_<reviewCount>-reviews.<xlsx|json>
```

Excel exports use one sheet named `Reviews`.

JSON exports use an array of normalized review objects.

## Error Handling

The popup shows status per product:

- Pending.
- Running.
- Done.
- Failed.
- Stopped.

Failures for one product do not stop the full batch. The extension records the failure message and continues with the next product unless the user stops the batch.

Common failures include:

- No product links found in the current tab.
- Link format cannot be parsed.
- Product page load timeout.
- Shopee review API returns an unexpected payload.
- Download fails.

## Permissions

Required Chrome permissions:

- `activeTab`: read the current tab when the user invokes the extension.
- `tabs`: open and close background product tabs.
- `scripting`: execute review fetch code inside product pages.
- `downloads`: save Excel and JSON files.
- `storage`: persist user settings.

Required host permissions cover only the supported Shopee marketplaces. The current-tab scan is user-initiated through `activeTab`, so the extension does not need blanket access to every website.

## Testing Strategy

Manual verification:

- Load the unpacked extension in Chrome.
- Test scanning pages with multiple Shopee product links.
- Test duplicate link removal.
- Test Excel export.
- Test JSON export.
- Test review count limits.
- Test newest-to-oldest ordering.
- Test pause, resume, and stop controls.
- Test a failed product does not block later products.

Code-level checks:

- Unit-test URL parsing with supported Shopee URL formats.
- Unit-test deduplication.
- Unit-test review normalization.
- Unit-test review sorting.
- Unit-test filename generation.

## Non-Goals For First Version

- Publishing to Chrome Web Store.
- Captcha solving or anti-bot bypass.
- Combining all products into one workbook.
- Running multiple product fetches in parallel.
- Editing exported column selection from the popup.
