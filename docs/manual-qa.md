# Manual QA

## Current Window Product Tabs

- Open three Shopee product detail tabs from different supported marketplaces in the same Chrome window.
- Open one Shopee search tab and one non-Shopee tab in the same window.
- Click `识别当前窗口商品页`.
- Verify exactly the three product tabs appear in the task list.
- Verify the search tab and non-Shopee tab do not appear.

## Pasted Links

- Paste one valid Shopee product URL, one category URL, and one plain text line.
- Click `导入链接`.
- Verify only the product URL appears in the task list.
- Verify the status message reports one ignored invalid line or category line according to line count.

## Retry Failed

- Run a small JSON export.
- If a task fails, click `重试失败项`.
- Verify only failed tasks return to `等待` and rerun.
- Verify successful tasks stay `成功`.
