# Current Window Product Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace current-page content scanning with current-window Shopee product tab detection, pasted-link import, simple task statuses, and retry-failed export flow.

**Architecture:** Add small shared modules for product-source parsing and task-state transitions so popup and background logic stay testable. The popup reads current-window tab URLs with `chrome.tabs.query({ currentWindow: true })`, merges those products with pasted products, and sends task products to the background queue. The background queue keeps one-product-at-a-time export behavior, removes final `stopped` task status, and adds a retry-failed message that requeues only failed tasks using each task's saved settings.

**Tech Stack:** Chrome Manifest V3, vanilla HTML/CSS/JavaScript, shared UMD-style JavaScript modules, Node built-in test runner, existing fflate-based XLSX export.

---

## File Structure

- Create `extension/shared/product-sources.js`: build product lists from current-window tabs and pasted text, merge source labels, dedupe by product key.
- Create `extension/shared/task-state.js`: allowed task statuses, UI labels, summaries, stop transitions, retry transitions.
- Create `tests/product-sources.test.js`: current-window tab URL filtering, pasted import, dedupe, source merge.
- Create `tests/task-state.test.js`: status labels, summary counts, stop behavior, retry reset behavior.
- Modify `extension/popup/popup.html`: replace scan-current-page UI with current-window scan, pasted-link import, retry-failed control.
- Modify `extension/popup/popup.css`: style pasted-link area, four-column action buttons, source label, summary text.
- Modify `extension/popup/popup.js`: remove script injection into active page, add current-window tab scan, paste import, merged task list, retry-failed button, simple statuses.
- Modify `extension/background/service-worker.js`: import task-state helper, handle `RETRY_FAILED`, stop without final `stopped` status, report success/failure counts.
- Modify `extension/manifest.json`: remove unused `activeTab` permission.
- Modify `scripts/validate-manifest.js`: stop requiring `activeTab`, continue checking required permissions.
- Modify `README.md`: update usage from current-page scanning to current-window tab detection and pasted-link import.
- Create `docs/manual-qa.md`: manual QA checklist for current-window tabs, pasted links, and retry.
- Delete `extension/content/content.js`: no page-DOM scanning remains.
- Delete `tests/content.test.js`: current-page content scanning tests are obsolete.

## Task 1: Product Source Helpers

**Files:**
- Create: `extension/shared/product-sources.js`
- Create: `tests/product-sources.test.js`
- Delete: `extension/content/content.js`
- Delete: `tests/content.test.js`

- [ ] **Step 1: Write failing product-source tests**

Create `tests/product-sources.test.js` with this content:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  productsFromTabs,
  productsFromPastedText,
  mergeProductSources,
  sourceLabel
} = require('../extension/shared/product-sources.js');

test('productsFromTabs keeps only Shopee product URLs from current window tabs', () => {
  const products = productsFromTabs([
    { id: 1, title: 'VN product', url: 'https://shopee.vn/Product-i.881817146.23661062670?sp_atk=abc' },
    { id: 2, title: 'Search', url: 'https://shopee.vn/search?keyword=blender' },
    { id: 3, title: 'Category', url: 'https://shopee.sg/Small-Kitchen-Appliances-cat.11027421.11027457' },
    { id: 4, title: 'MY product', url: 'https://shopee.com.my/product/531049349/44201384883' },
    { id: 5, title: 'Other', url: 'https://example.com/a.1.2' }
  ]);

  assert.deepEqual(products.map((product) => ({
    key: product.key,
    source: product.source,
    sources: product.sources,
    tabId: product.tabId
  })), [
    {
      key: 'shopee.vn:881817146:23661062670',
      source: '标签页',
      sources: ['tab'],
      tabId: 1
    },
    {
      key: 'shopee.com.my:531049349:44201384883',
      source: '标签页',
      sources: ['tab'],
      tabId: 4
    }
  ]);
});

test('productsFromPastedText imports product URLs and counts invalid lines', () => {
  const result = productsFromPastedText([
    'https://shopee.sg/Product-i.602945153.27881688856',
    'https://shopee.sg/Small-Kitchen-Appliances-cat.11027421.11027457',
    'ordinary text',
    'two links https://shopee.vn/A-i.1.2 and https://shopee.vn/B-i.3.4'
  ].join('\n'));

  assert.equal(result.importedCount, 3);
  assert.equal(result.ignoredCount, 2);
  assert.deepEqual(result.products.map((product) => ({
    key: product.key,
    source: product.source,
    sources: product.sources
  })), [
    { key: 'shopee.sg:602945153:27881688856', source: '粘贴', sources: ['paste'] },
    { key: 'shopee.vn:1:2', source: '粘贴', sources: ['paste'] },
    { key: 'shopee.vn:3:4', source: '粘贴', sources: ['paste'] }
  ]);
});

test('mergeProductSources dedupes products and merges source labels', () => {
  const tabProducts = productsFromTabs([
    { id: 1, title: 'VN product', url: 'https://shopee.vn/Product-i.1.2' }
  ]);
  const pasted = productsFromPastedText([
    'https://shopee.vn/Product-i.1.2',
    'https://shopee.vn/Other-i.3.4'
  ].join('\n'));

  const merged = mergeProductSources(tabProducts, pasted.products);

  assert.deepEqual(merged.map((product) => ({
    key: product.key,
    source: product.source,
    sources: product.sources
  })), [
    { key: 'shopee.vn:1:2', source: '标签页/粘贴', sources: ['tab', 'paste'] },
    { key: 'shopee.vn:3:4', source: '粘贴', sources: ['paste'] }
  ]);
});

test('sourceLabel keeps stable source display order', () => {
  assert.equal(sourceLabel(['paste', 'tab', 'paste']), '标签页/粘贴');
  assert.equal(sourceLabel(['paste']), '粘贴');
  assert.equal(sourceLabel(['tab']), '标签页');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/product-sources.test.js
```

Expected: FAIL because `extension/shared/product-sources.js` does not exist.

- [ ] **Step 3: Implement `extension/shared/product-sources.js`**

Create `extension/shared/product-sources.js` with this content:

```js
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
```

- [ ] **Step 4: Delete obsolete current-page content scanner**

Run:

```bash
rm extension/content/content.js tests/content.test.js
```

Expected: both files are removed from the worktree. The extension no longer has a content scanner that reads DOM links.

- [ ] **Step 5: Run product-source tests to verify pass**

Run:

```bash
node --test tests/product-sources.test.js
```

Expected: PASS for all product-source tests.

- [ ] **Step 6: Commit product source helpers**

Run:

```bash
git add extension/shared/product-sources.js tests/product-sources.test.js extension/content/content.js tests/content.test.js
git commit -m "feat: add product source helpers"
```

## Task 2: Task State Helpers

**Files:**
- Create: `extension/shared/task-state.js`
- Create: `tests/task-state.test.js`

- [ ] **Step 1: Write failing task-state tests**

Create `tests/task-state.test.js` with this content:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TASK_STATUS,
  normalizeTaskStatus,
  statusLabel,
  summarizeTasks,
  prepareTasksForStop,
  resetFailedTasksForRetry,
  hasFailedTasks
} = require('../extension/shared/task-state.js');

test('normalizeTaskStatus allows only four public task statuses', () => {
  assert.equal(normalizeTaskStatus('pending'), TASK_STATUS.PENDING);
  assert.equal(normalizeTaskStatus('running'), TASK_STATUS.RUNNING);
  assert.equal(normalizeTaskStatus('done'), TASK_STATUS.DONE);
  assert.equal(normalizeTaskStatus('failed'), TASK_STATUS.FAILED);
  assert.equal(normalizeTaskStatus('stopped'), TASK_STATUS.FAILED);
  assert.equal(normalizeTaskStatus('unknown'), TASK_STATUS.PENDING);
});

test('statusLabel renders simplified Chinese labels', () => {
  assert.equal(statusLabel('pending'), '等待');
  assert.equal(statusLabel('running'), '导出中');
  assert.equal(statusLabel('done'), '成功');
  assert.equal(statusLabel('failed'), '失败');
  assert.equal(statusLabel('stopped'), '失败');
});

test('summarizeTasks returns total success and failure counts', () => {
  const summary = summarizeTasks([
    { status: 'done' },
    { status: 'failed' },
    { status: 'running' },
    { status: 'pending' }
  ]);

  assert.deepEqual(summary, {
    total: 4,
    done: 1,
    failed: 1,
    running: 1,
    pending: 1
  });
});

test('prepareTasksForStop keeps done failed and pending, marks running failed', () => {
  const tasks = prepareTasksForStop([
    { id: 'a', status: 'done', fetched: 10, error: '' },
    { id: 'b', status: 'failed', fetched: 1, error: 'HTTP 403' },
    { id: 'c', status: 'running', fetched: 2, error: '' },
    { id: 'd', status: 'pending', fetched: 0, error: '' },
    { id: 'e', status: 'stopped', fetched: 0, error: '' }
  ]);

  assert.deepEqual(tasks.map((task) => ({ id: task.id, status: task.status, error: task.error })), [
    { id: 'a', status: 'done', error: '' },
    { id: 'b', status: 'failed', error: 'HTTP 403' },
    { id: 'c', status: 'failed', error: '已停止' },
    { id: 'd', status: 'pending', error: '' },
    { id: 'e', status: 'failed', error: '已停止' }
  ]);
});

test('resetFailedTasksForRetry requeues only failed tasks and reports retry count', () => {
  const result = resetFailedTasksForRetry([
    { id: 'a', status: 'done', fetched: 10, error: '' },
    { id: 'b', status: 'failed', fetched: 3, error: 'HTTP 403' },
    { id: 'c', status: 'pending', fetched: 0, error: '' }
  ]);

  assert.equal(result.retryCount, 1);
  assert.deepEqual(result.tasks.map((task) => ({
    id: task.id,
    status: task.status,
    fetched: task.fetched,
    error: task.error,
    retry: Boolean(task.retry)
  })), [
    { id: 'a', status: 'done', fetched: 10, error: '', retry: false },
    { id: 'b', status: 'pending', fetched: 0, error: '', retry: true },
    { id: 'c', status: 'pending', fetched: 0, error: '', retry: false }
  ]);
});

test('hasFailedTasks detects failed tasks after normalizing legacy stopped status', () => {
  assert.equal(hasFailedTasks([{ status: 'done' }]), false);
  assert.equal(hasFailedTasks([{ status: 'stopped' }]), true);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/task-state.test.js
```

Expected: FAIL because `extension/shared/task-state.js` does not exist.

- [ ] **Step 3: Implement `extension/shared/task-state.js`**

Create `extension/shared/task-state.js` with this content:

```js
(function attachTaskState(global) {
  const TASK_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    DONE: 'done',
    FAILED: 'failed'
  };

  function normalizeTaskStatus(status) {
    if (status === TASK_STATUS.RUNNING) return TASK_STATUS.RUNNING;
    if (status === TASK_STATUS.DONE) return TASK_STATUS.DONE;
    if (status === TASK_STATUS.FAILED || status === 'stopped') return TASK_STATUS.FAILED;
    return TASK_STATUS.PENDING;
  }

  function statusLabel(status) {
    return {
      [TASK_STATUS.PENDING]: '等待',
      [TASK_STATUS.RUNNING]: '导出中',
      [TASK_STATUS.DONE]: '成功',
      [TASK_STATUS.FAILED]: '失败'
    }[normalizeTaskStatus(status)];
  }

  function summarizeTasks(tasks = []) {
    const summary = {
      total: tasks.length,
      done: 0,
      failed: 0,
      running: 0,
      pending: 0
    };

    for (const task of tasks) {
      const status = normalizeTaskStatus(task?.status);
      summary[status] += 1;
    }

    return summary;
  }

  function prepareTasksForStop(tasks = []) {
    return tasks.map((task) => {
      const status = normalizeTaskStatus(task?.status);
      if (status === TASK_STATUS.RUNNING) {
        return { ...task, status: TASK_STATUS.FAILED, error: '已停止' };
      }
      if (task?.status === 'stopped') {
        return { ...task, status: TASK_STATUS.FAILED, error: task.error || '已停止' };
      }
      return { ...task, status };
    });
  }

  function resetFailedTasksForRetry(tasks = []) {
    let retryCount = 0;
    const resetTasks = tasks.map((task) => {
      const status = normalizeTaskStatus(task?.status);
      if (status !== TASK_STATUS.FAILED) {
        return { ...task, status, retry: false };
      }
      retryCount += 1;
      return {
        ...task,
        status: TASK_STATUS.PENDING,
        fetched: 0,
        error: '',
        retry: true
      };
    });

    return { tasks: resetTasks, retryCount };
  }

  function hasFailedTasks(tasks = []) {
    return tasks.some((task) => normalizeTaskStatus(task?.status) === TASK_STATUS.FAILED);
  }

  const api = {
    TASK_STATUS,
    normalizeTaskStatus,
    statusLabel,
    summarizeTasks,
    prepareTasksForStop,
    resetFailedTasksForRetry,
    hasFailedTasks
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ShopeeReviewExporter = Object.assign(global.ShopeeReviewExporter || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
```

- [ ] **Step 4: Run task-state tests to verify pass**

Run:

```bash
node --test tests/task-state.test.js
```

Expected: PASS for all task-state tests.

- [ ] **Step 5: Commit task-state helpers**

Run:

```bash
git add extension/shared/task-state.js tests/task-state.test.js
git commit -m "feat: add task state helpers"
```

## Task 3: Popup Current-Window And Pasted Import UI

**Files:**
- Modify: `extension/popup/popup.html`
- Modify: `extension/popup/popup.css`
- Modify: `extension/popup/popup.js`
- Modify: `extension/manifest.json`
- Modify: `scripts/validate-manifest.js`

- [ ] **Step 1: Add shared scripts and new controls to `popup.html`**

Replace the existing header and action sections in `extension/popup/popup.html` with this structure, keeping the same `<head>` and `<main class="popup-shell">` wrapper:

```html
<header class="header">
  <h1>Shopee 评论导出</h1>
  <button id="scanWindowButton" class="button secondary" type="button">识别当前窗口商品页</button>
</header>

<section class="settings" aria-label="导出设置">
  <label>
    导出格式
    <select id="formatSelect">
      <option value="xlsx">Excel (.xlsx)</option>
      <option value="json">JSON (.json)</option>
    </select>
  </label>

  <label>
    每个商品评论条数
    <input id="countInput" type="number" min="1" max="5000" value="100">
  </label>

  <label>
    评论筛选
    <select id="filterSelect">
      <option value="all">全部评论</option>
      <option value="media">带图/视频</option>
      <option value="star-5">5 星</option>
      <option value="star-4">4 星</option>
      <option value="star-3">3 星</option>
      <option value="star-2">2 星</option>
      <option value="star-1">1 星</option>
    </select>
  </label>
</section>

<section class="paste-panel" aria-label="粘贴商品链接">
  <label>
    粘贴商品链接
    <textarea id="pasteInput" rows="4" placeholder="每行一个商品链接，或粘贴包含商品链接的一段文本"></textarea>
  </label>
  <div class="paste-actions">
    <button id="importLinksButton" class="button secondary" type="button">导入链接</button>
    <button id="clearPasteButton" class="button secondary" type="button">清空输入</button>
  </div>
</section>

<section class="actions">
  <button id="startButton" class="button primary" type="button" disabled>开始导出</button>
  <button id="pauseButton" class="button secondary" type="button" disabled>暂停</button>
  <button id="stopButton" class="button danger" type="button" disabled>停止</button>
  <button id="retryFailedButton" class="button secondary" type="button" disabled>重试失败项</button>
</section>

<section class="summary" id="summary">尚未识别商品</section>
<section class="task-list" id="taskList" aria-label="商品任务列表"></section>
<footer class="status" id="status">就绪</footer>
```

At the bottom of `popup.html`, replace the script list with:

```html
<script src="../shared/shopee-sites.js"></script>
<script src="../shared/url-parser.js"></script>
<script src="../shared/review-filter.js"></script>
<script src="../shared/product-sources.js"></script>
<script src="../shared/task-state.js"></script>
<script src="popup.js"></script>
```

- [ ] **Step 2: Update popup styles**

In `extension/popup/popup.css`, make these exact changes:

```css
body {
  width: 460px;
  margin: 0;
  color: #1f2933;
  background: #f7f8fa;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

Add this block after the `input` styles:

```css
textarea {
  width: 100%;
  min-height: 82px;
  resize: vertical;
  border: 1px solid #cfd6dd;
  border-radius: 6px;
  padding: 7px 8px;
  background: #fff;
  color: #1f2933;
  font: inherit;
}

.paste-panel {
  display: grid;
  gap: 8px;
  margin-top: 10px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e6e8eb;
  border-radius: 8px;
}

.paste-panel label {
  display: grid;
  gap: 5px;
  font-weight: 600;
}

.paste-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
```

Replace the `.actions` block with:

```css
.actions {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 8px;
  margin: 12px 0;
}
```

Add this block after `.task-url`:

```css
.task-meta {
  margin-top: 4px;
  color: #697987;
}
```

Replace `.status-failed, .status-stopped` with:

```css
.status-failed {
  color: #b42318;
}
```

- [ ] **Step 3: Replace popup behavior**

Replace `extension/popup/popup.js` with this content:

```js
const scanWindowButton = document.getElementById('scanWindowButton');
const startButton = document.getElementById('startButton');
const pauseButton = document.getElementById('pauseButton');
const stopButton = document.getElementById('stopButton');
const retryFailedButton = document.getElementById('retryFailedButton');
const importLinksButton = document.getElementById('importLinksButton');
const clearPasteButton = document.getElementById('clearPasteButton');
const pasteInput = document.getElementById('pasteInput');
const formatSelect = document.getElementById('formatSelect');
const countInput = document.getElementById('countInput');
const filterSelect = document.getElementById('filterSelect');
const summary = document.getElementById('summary');
const taskList = document.getElementById('taskList');
const status = document.getElementById('status');

let products = [];
let paused = false;
let backgroundRunning = false;

scanWindowButton.addEventListener('click', scanCurrentWindowTabs);
startButton.addEventListener('click', startExport);
pauseButton.addEventListener('click', togglePause);
stopButton.addEventListener('click', stopExport);
retryFailedButton.addEventListener('click', retryFailed);
importLinksButton.addEventListener('click', importPastedLinks);
clearPasteButton.addEventListener('click', () => {
  pasteInput.value = '';
});
formatSelect.addEventListener('change', saveSettings);
countInput.addEventListener('change', saveSettings);
filterSelect.addEventListener('change', saveSettings);
chrome.runtime.onMessage.addListener(handleBackgroundMessage);

restoreSettings();
requestState();

async function scanCurrentWindowTabs() {
  try {
    status.textContent = '正在识别当前窗口商品页...';
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tabProducts = ShopeeReviewExporter.productsFromTabs(tabs);
    products = ShopeeReviewExporter.mergeProductSources(products, tabProducts);
    renderProducts(products.map((product) => ({ ...product, status: 'pending', fetched: 0, target: getSettings().count })));
    summary.textContent = buildSummaryText();
    status.textContent = `识别到 ${tabProducts.length} 个商品`;
    startButton.disabled = backgroundRunning || products.length === 0;
  } catch (error) {
    status.textContent = `识别失败：${error.message}`;
  }
}

function importPastedLinks() {
  const result = ShopeeReviewExporter.productsFromPastedText(pasteInput.value);
  const beforeCount = products.length;
  products = ShopeeReviewExporter.mergeProductSources(products, result.products);
  const addedCount = products.length - beforeCount;
  renderProducts(products.map((product) => ({ ...product, status: 'pending', fetched: 0, target: getSettings().count })));
  summary.textContent = buildSummaryText();
  status.textContent = `已导入 ${addedCount} 个商品，忽略 ${result.ignoredCount} 条无效内容`;
  startButton.disabled = backgroundRunning || products.length === 0;
}

function getSettings() {
  return {
    format: formatSelect.value,
    count: Math.max(1, Math.min(5000, Number(countInput.value || 100))),
    reviewFilter: normalizeReviewFilterValue(filterSelect.value)
  };
}

function saveSettings() {
  chrome.storage.local.set({ exportSettings: getSettings() });
}

async function restoreSettings() {
  const { exportSettings } = await chrome.storage.local.get('exportSettings');
  if (!exportSettings) return;
  formatSelect.value = exportSettings.format || 'xlsx';
  countInput.value = exportSettings.count || 100;
  filterSelect.value = resolveStoredReviewFilter(exportSettings);
}

function normalizeReviewFilterValue(value) {
  return ShopeeReviewExporter.normalizeReviewFilterValue(value);
}

function resolveStoredReviewFilter(exportSettings) {
  if (exportSettings.reviewFilter !== null && typeof exportSettings.reviewFilter !== 'undefined') {
    return normalizeReviewFilterValue(exportSettings.reviewFilter);
  }

  return ShopeeReviewExporter.resolveReviewFilter(exportSettings.filter).reviewFilter;
}

async function startExport() {
  const settings = getSettings();
  saveSettings();
  paused = false;
  pauseButton.textContent = '暂停';
  startButton.disabled = true;
  pauseButton.disabled = false;
  stopButton.disabled = false;
  retryFailedButton.disabled = true;
  status.textContent = '正在开始导出...';
  const response = await sendRuntimeMessage({ type: 'START_EXPORT', products, settings });
  if (!response.ok) {
    status.textContent = '后台服务尚未就绪，暂时无法开始导出';
    startButton.disabled = products.length === 0;
    pauseButton.disabled = true;
    stopButton.disabled = true;
  } else {
    backgroundRunning = true;
  }
}

async function retryFailed() {
  retryFailedButton.disabled = true;
  status.textContent = '正在重试失败项...';
  const response = await sendRuntimeMessage({ type: 'RETRY_FAILED' });
  if (!response.ok) {
    status.textContent = '后台服务尚未就绪，暂时无法重试';
  } else {
    backgroundRunning = true;
    paused = false;
    pauseButton.textContent = '暂停';
  }
}

async function togglePause() {
  paused = !paused;
  pauseButton.textContent = paused ? '继续' : '暂停';
  const response = await sendRuntimeMessage({ type: paused ? 'PAUSE_EXPORT' : 'RESUME_EXPORT' });
  if (!response.ok) {
    paused = !paused;
    pauseButton.textContent = paused ? '继续' : '暂停';
    status.textContent = '后台服务尚未就绪，暂时无法切换暂停状态';
  }
}

async function stopExport() {
  const response = await sendRuntimeMessage({ type: 'STOP_EXPORT' });
  if (!response.ok) status.textContent = '后台服务尚未就绪，已重置弹窗控制状态';
  backgroundRunning = false;
  paused = false;
  pauseButton.textContent = '暂停';
  updateControls();
}

async function requestState() {
  const response = await sendRuntimeMessage({ type: 'GET_STATE' });
  if (response.ok && response.value) applyState(response.value);
}

async function sendRuntimeMessage(message) {
  try {
    return { ok: true, value: await chrome.runtime.sendMessage(message) };
  } catch {
    return { ok: false, value: null };
  }
}

function handleBackgroundMessage(message) {
  if (message.type === 'EXPORT_STATE') {
    applyState(message.state);
  }
}

function applyState(state) {
  if (!state) return;

  const tasks = Array.isArray(state.tasks) ? state.tasks : null;
  if (tasks) {
    renderProducts(tasks);
    products = tasks.map(({ error, fetched, status, target, id, reviewFilter, filter, ratingType, format, ...product }) => product);
  }

  if (typeof state.message === 'string') status.textContent = state.message;

  backgroundRunning = Boolean(state.running);
  paused = Boolean(state.paused);
  pauseButton.textContent = paused ? '继续' : '暂停';
  summary.textContent = buildSummaryText(tasks || products);
  updateControls(tasks);
}

function updateControls(tasks = null) {
  const hasProducts = products.length > 0;
  const hasFailures = ShopeeReviewExporter.hasFailedTasks(tasks || []);
  startButton.disabled = backgroundRunning || !hasProducts;
  pauseButton.disabled = !backgroundRunning;
  stopButton.disabled = !backgroundRunning;
  retryFailedButton.disabled = backgroundRunning || !hasFailures;
}

function buildSummaryText(tasks = products) {
  const summaryCounts = ShopeeReviewExporter.summarizeTasks(tasks);
  return `总数：${summaryCounts.total} · 成功：${summaryCounts.done} · 失败：${summaryCounts.failed}`;
}

function renderProducts(tasks) {
  taskList.innerHTML = '';
  for (const task of tasks) {
    const statusText = ShopeeReviewExporter.statusLabel(task.status);
    const displayMarket = task.marketplaceCode || task.marketplace;
    const fetched = task.fetched || 0;
    const target = task.target || getSettings().count;
    const error = task.error ? ` · ${escapeHtml(task.error)}` : '';
    const item = document.createElement('article');
    item.className = 'task';
    item.innerHTML = `
      <div class="task-title">
        <span>${escapeHtml(displayMarket)} / ${escapeHtml(task.shopId)}.${escapeHtml(task.itemId)}</span>
        <span class="${statusClass(task.status)}">${escapeHtml(statusText)}</span>
      </div>
      <div class="task-url" title="${escapeHtml(task.url)}">${escapeHtml(task.url)}</div>
      <div class="task-meta">来源：${escapeHtml(task.source || '')}</div>
      <div class="task-progress">${escapeHtml(fetched)}/${escapeHtml(target)} 条${error}</div>
    `;
    taskList.appendChild(item);
  }
}

function statusClass(value) {
  const status = ShopeeReviewExporter.normalizeTaskStatus(value);
  return {
    running: 'status-running',
    done: 'status-done',
    failed: 'status-failed'
  }[status] || '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}
```

- [ ] **Step 4: Remove unused `activeTab` permission**

In `extension/manifest.json`, remove `"activeTab"` from the `permissions` array. Keep these permissions:

```json
"permissions": [
  "tabs",
  "scripting",
  "downloads",
  "storage",
  "alarms"
]
```

- [ ] **Step 5: Update manifest validation**

In `scripts/validate-manifest.js`, remove this assertion:

```js
assert.ok(manifest.permissions.includes('activeTab'));
```

Add this assertion after the other permission assertions:

```js
assert.equal(manifest.permissions.includes('activeTab'), false);
```

- [ ] **Step 6: Run verification**

Run:

```bash
npm run verify
```

Expected: PASS. Manifest validation passes without `activeTab`.

- [ ] **Step 7: Commit popup current-window import UI**

Run:

```bash
git add extension/popup/popup.html extension/popup/popup.css extension/popup/popup.js extension/manifest.json scripts/validate-manifest.js
git commit -m "feat: scan current window product tabs"
```

## Task 4: Background Retry And Simplified Statuses

**Files:**
- Modify: `extension/background/service-worker.js`

- [ ] **Step 1: Import task-state helper**

In `extension/background/service-worker.js`, add `../shared/task-state.js` to `importScripts` after `../shared/review-filter.js`:

```js
importScripts(
  '../lib/fflate.min.js',
  '../shared/shopee-sites.js',
  '../shared/url-parser.js',
  '../shared/review-filter.js',
  '../shared/task-state.js',
  '../shared/reviews.js',
  '../shared/export-format.js',
  '../shared/xlsx-export.js'
);
```

- [ ] **Step 2: Add `RETRY_FAILED` message handler**

Add this block inside `chrome.runtime.onMessage.addListener`, before `GET_STATE`:

```js
if (message.type === 'RETRY_FAILED') {
  initializationPromise
    .then(() => retryFailedTasks())
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
}
```

- [ ] **Step 3: Update stop behavior**

Replace the body of the async function inside `stopExport` with:

```js
activeRunId += 1;
activeQueuePromise = null;
state.stopped = true;
state.paused = false;
state.running = false;
state.message = '已停止';
state.tasks = ShopeeReviewExporter.prepareTasksForStop(state.tasks);

await closeCurrentTab();
await clearQueueAlarm();
publishState();
```

- [ ] **Step 4: Add retry function**

Add this function after `stopExport`:

```js
async function retryFailedTasks() {
  if (state.running || state.currentTabId !== null) {
    await stopExport();
  }

  const retryState = ShopeeReviewExporter.resetFailedTasksForRetry(state.tasks);
  if (retryState.retryCount === 0) {
    state.message = '没有失败任务可重试';
    publishState();
    return;
  }

  activeRunId += 1;
  const runId = activeRunId;
  state = {
    running: true,
    paused: false,
    stopped: false,
    currentTabId: null,
    tasks: retryState.tasks.map((task) => task.retry
      ? { ...task, retryRunId: runId, retry: false }
      : { ...task, retry: false }),
    message: `准备重试 ${retryState.retryCount} 个失败商品`
  };
  publishState();
  continueQueue(runId);
}
```

- [ ] **Step 5: Update task status assignments in `runQueue`**

At the top of `runQueue`, immediately after the function declaration line, add:

```js
const retryMode = state.tasks.some((task) => task.retryRunId === runId);
```

Replace literal status assignments in `runQueue` with task-state constants:

```js
if (task.status !== ShopeeReviewExporter.TASK_STATUS.PENDING) continue;
if (retryMode && task.retryRunId !== runId) continue;

task.status = ShopeeReviewExporter.TASK_STATUS.RUNNING;
```

Replace successful completion:

```js
task.status = ShopeeReviewExporter.TASK_STATUS.DONE;
delete task.retryRunId;
state.message = `已完成 ${task.shopId}.${task.itemId}`;
```

Replace catch behavior:

```js
if (!isActiveRun(runId)) return;
task.status = ShopeeReviewExporter.TASK_STATUS.FAILED;
task.error = error.message || String(error);
delete task.retryRunId;
state.message = `导出失败：${task.error}`;
```

Replace final queue message with:

```js
const summary = ShopeeReviewExporter.summarizeTasks(state.tasks);
state.running = false;
state.paused = false;
state.stopped = false;
state.message = `导出完成：成功 ${summary.done} 个，失败 ${summary.failed} 个`;
await clearQueueAlarm();
publishState();
```

- [ ] **Step 6: Update `continueQueue` stopped handling**

Replace the first guard in `continueQueue` with:

```js
if (!state.running || state.paused || state.stopped) {
  if (state.paused || state.stopped) clearQueueAlarm().catch(() => {});
  return;
}
```

Keep the existing queue scheduling after this guard.

- [ ] **Step 7: Normalize restored statuses**

Inside `initializeFromStorage`, replace task assignment with:

```js
tasks: Array.isArray(saved.tasks)
  ? saved.tasks.map((task) => ({
    ...task,
    status: ShopeeReviewExporter.normalizeTaskStatus(task.status)
  }))
  : [],
```

Inside the recovery loop, replace:

```js
if (task.status === 'running') {
  task.status = 'pending';
}
```

with:

```js
if (task.status === ShopeeReviewExporter.TASK_STATUS.RUNNING) {
  task.status = ShopeeReviewExporter.TASK_STATUS.PENDING;
}
```

- [ ] **Step 8: Run verification**

Run:

```bash
npm run verify
```

Expected: PASS for all tests and manifest validation.

- [ ] **Step 9: Commit retry and simplified status behavior**

Run:

```bash
git add extension/background/service-worker.js
git commit -m "feat: retry failed export tasks"
```

## Task 5: Documentation And Manual QA

**Files:**
- Modify: `README.md`
- Create: `docs/manual-qa.md`

- [ ] **Step 1: Update README usage**

In `README.md`, replace the Usage section with:

```markdown
## Usage

1. Open one or more Shopee product detail pages in the same Chrome window.
2. Open the extension popup.
3. Click `识别当前窗口商品页`.
4. Optionally paste extra Shopee product links into `粘贴商品链接` and click `导入链接`.
5. Choose export format, review count, and review filter.
6. Click `开始导出`.
7. Review the task list for `成功` and `失败`.
8. Click `重试失败项` to rerun only failed products.
```

- [ ] **Step 2: Create manual QA checklist**

Create `docs/manual-qa.md` with this content:

```markdown
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
```

- [ ] **Step 3: Run final verification**

Run:

```bash
npm run verify
```

Expected: PASS. Tests include product-source, task-state, URL parser, review normalization, export formatting, XLSX XML, and manifest validation.

- [ ] **Step 4: Check git status**

Run:

```bash
git status --short
```

Expected: only `?? node_modules/` remains untracked.

- [ ] **Step 5: Commit docs**

Run:

```bash
git add README.md docs/manual-qa.md
git commit -m "docs: update current-window export usage"
```

## Final Manual Browser Verification

After all tasks are implemented and `npm run verify` passes:

1. Open `chrome://extensions`.
2. Click refresh on the unpacked `Shopee Review Exporter` extension.
3. In one Chrome window, open:
   - One `shopee.vn` product page.
   - One `shopee.sg` product page.
   - One `shopee.com.my` product page.
   - One Shopee search page.
   - One non-Shopee page.
4. Open the extension popup.
5. Click `识别当前窗口商品页`.
6. Verify the popup lists only the three product pages.
7. Set format to JSON and count to `5`.
8. Click `开始导出`.
9. Verify one downloaded file per product.
10. If any task fails, click `重试失败项` and verify only failed tasks rerun.

## Completion Criteria

- `npm run verify` exits 0.
- Popup no longer has `扫描当前页`.
- Product discovery reads current-window tab URLs only.
- Pasted import accepts valid product URLs and ignores invalid content outside task list.
- Task statuses shown to the user are only `等待`, `导出中`, `成功`, `失败`.
- Retry button reruns only failed tasks.
- No product discovery code reads page DOM, anchor tags, page text, breadcrumbs, or recommended products.
