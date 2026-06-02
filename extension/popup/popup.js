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
let visibleTasks = [];
let paused = false;
let backgroundRunning = false;

scanWindowButton.addEventListener('click', scanCurrentWindowTabs);
startButton.addEventListener('click', startExport);
pauseButton.addEventListener('click', togglePause);
stopButton.addEventListener('click', stopExport);
retryFailedButton.addEventListener('click', retryFailed);
importLinksButton.addEventListener('click', importPastedLinks);
clearPasteButton.addEventListener('click', () => {
  if (backgroundRunning) return;
  pasteInput.value = '';
});
formatSelect.addEventListener('change', saveSettings);
countInput.addEventListener('change', saveSettings);
filterSelect.addEventListener('change', saveSettings);
chrome.runtime.onMessage.addListener(handleBackgroundMessage);

restoreSettings();
requestState();

async function scanCurrentWindowTabs() {
  if (backgroundRunning) return;

  try {
    status.textContent = '正在识别当前窗口商品页...';
    const tabs = await chrome.tabs.query({ currentWindow: true });
    if (backgroundRunning) return;

    const tabProducts = ShopeeReviewExporter.productsFromTabs(tabs);
    products = ShopeeReviewExporter.mergeProductSources(products, tabProducts);
    renderProducts(products.map((product) => ({ ...product, status: 'pending', fetched: 0, target: getSettings().count })));
    summary.textContent = buildSummaryText();
    status.textContent = `识别到 ${tabProducts.length} 个商品`;
    updateControls();
  } catch (error) {
    status.textContent = `识别失败：${error.message}`;
  }
}

function importPastedLinks() {
  if (backgroundRunning) return;

  const result = ShopeeReviewExporter.productsFromPastedText(pasteInput.value);
  const beforeCount = products.length;
  products = ShopeeReviewExporter.mergeProductSources(products, result.products);
  const addedCount = products.length - beforeCount;
  renderProducts(products.map((product) => ({ ...product, status: 'pending', fetched: 0, target: getSettings().count })));
  summary.textContent = buildSummaryText();
  status.textContent = `已导入 ${addedCount} 个商品，忽略 ${result.ignoredCount} 条无效内容`;
  updateControls();
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
  if (backgroundRunning || products.length === 0) return;

  const settings = getSettings();
  saveSettings();
  paused = false;
  pauseButton.textContent = '暂停';
  backgroundRunning = true;
  updateControls();
  status.textContent = '正在开始导出...';
  const response = await sendRuntimeMessage({ type: 'START_EXPORT', products, settings });
  if (!response.ok) {
    backgroundRunning = false;
    status.textContent = '后台服务尚未就绪，暂时无法开始导出';
    updateControls();
  }
}

async function retryFailed() {
  if (backgroundRunning) return;

  backgroundRunning = true;
  paused = false;
  pauseButton.textContent = '暂停';
  updateControls();
  status.textContent = '正在重试失败项...';
  const response = await sendRuntimeMessage({ type: 'RETRY_FAILED' });
  if (!response.ok) {
    backgroundRunning = false;
    status.textContent = '后台服务尚未就绪，暂时无法重试';
    updateControls();
    return;
  }

  updateControls();
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
    const value = await chrome.runtime.sendMessage(message);
    if (isBackgroundCommand(message.type)) {
      return { ok: value?.ok === true, value };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, value: null };
  }
}

function isBackgroundCommand(type) {
  return [
    'START_EXPORT',
    'PAUSE_EXPORT',
    'RESUME_EXPORT',
    'STOP_EXPORT',
    'RETRY_FAILED'
  ].includes(type);
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
    products = tasks.map(({ error, fetched, pageFetches, status, target, id, reviewFilter, filter, ratingType, format, ...product }) => product);
  }

  if (typeof state.message === 'string') status.textContent = state.message;

  backgroundRunning = Boolean(state.running);
  paused = Boolean(state.paused);
  pauseButton.textContent = paused ? '继续' : '暂停';
  summary.textContent = buildSummaryText(tasks || products);
  updateControls(tasks);
}

function updateControls(tasks = null) {
  const controlTasks = tasks || visibleTasks;
  const hasProducts = products.length > 0;
  const hasFailures = ShopeeReviewExporter.hasFailedTasks(controlTasks);
  startButton.disabled = backgroundRunning || !hasProducts;
  pauseButton.disabled = !backgroundRunning;
  stopButton.disabled = !backgroundRunning;
  retryFailedButton.disabled = backgroundRunning || !hasFailures;
  scanWindowButton.disabled = backgroundRunning;
  pasteInput.disabled = backgroundRunning;
  importLinksButton.disabled = backgroundRunning;
  clearPasteButton.disabled = backgroundRunning;
}

function buildSummaryText(tasks = products) {
  const summaryCounts = ShopeeReviewExporter.summarizeTasks(tasks);
  if (summaryCounts.total === 0) return '尚未识别商品';
  return `总数：${summaryCounts.total} · 成功：${summaryCounts.done} · 失败：${summaryCounts.failed}`;
}

function renderProducts(tasks) {
  visibleTasks = Array.isArray(tasks) ? tasks : [];
  taskList.innerHTML = '';
  for (const task of visibleTasks) {
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
