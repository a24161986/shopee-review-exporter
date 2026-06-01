const scanButton = document.getElementById('scanButton');
const startButton = document.getElementById('startButton');
const pauseButton = document.getElementById('pauseButton');
const stopButton = document.getElementById('stopButton');
const formatSelect = document.getElementById('formatSelect');
const countInput = document.getElementById('countInput');
const filterSelect = document.getElementById('filterSelect');
const summary = document.getElementById('summary');
const taskList = document.getElementById('taskList');
const status = document.getElementById('status');

let products = [];
let paused = false;
let backgroundRunning = false;

scanButton.addEventListener('click', scanCurrentTab);
startButton.addEventListener('click', startExport);
pauseButton.addEventListener('click', togglePause);
stopButton.addEventListener('click', stopExport);
formatSelect.addEventListener('change', saveSettings);
countInput.addEventListener('change', saveSettings);
filterSelect.addEventListener('change', saveSettings);
chrome.runtime.onMessage.addListener(handleBackgroundMessage);

restoreSettings();
requestState();

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('找不到当前标签页');
  return tab;
}

async function scanCurrentTab() {
  try {
    status.textContent = '正在扫描当前页...';
    const tab = await getActiveTab();
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['shared/shopee-sites.js', 'shared/url-parser.js', 'content/content.js']
    });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.ShopeeReviewExporter.scanCurrentPage()
    });
    products = result?.result?.products || [];
    renderProducts(products.map((product) => ({ ...product, status: 'pending', fetched: 0, target: getSettings().count })));
    summary.textContent = `找到 ${products.length} 个 Shopee 商品链接`;
    status.textContent = products.length ? '扫描完成' : '当前页没有可识别的 Shopee 商品链接';
    startButton.disabled = backgroundRunning || products.length === 0;
  } catch (error) {
    products = [];
    renderProducts([]);
    summary.textContent = '扫描失败，当前没有可导出的商品';
    status.textContent = `扫描失败：${error.message}`;
    startButton.disabled = true;
    if (!backgroundRunning) {
      pauseButton.disabled = true;
      stopButton.disabled = true;
    }
  }
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
  startButton.disabled = products.length === 0;
  pauseButton.disabled = true;
  stopButton.disabled = true;
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
    products = tasks.map(({ error, fetched, status, target, ...product }) => product);
  }

  if (typeof state.message === 'string') status.textContent = state.message;

  backgroundRunning = Boolean(state.running);
  paused = Boolean(state.paused);
  pauseButton.textContent = paused ? '继续' : '暂停';

  startButton.disabled = backgroundRunning || products.length === 0;
  pauseButton.disabled = !backgroundRunning;
  stopButton.disabled = !backgroundRunning;
}

function renderProducts(tasks) {
  taskList.innerHTML = '';
  for (const task of tasks) {
    const statusText = statusLabel(task.status);
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
      <div class="task-progress">${escapeHtml(fetched)}/${escapeHtml(target)} 条${error}</div>
    `;
    taskList.appendChild(item);
  }
}

function statusLabel(value) {
  return {
    pending: '等待',
    running: '导出中',
    done: '完成',
    failed: '失败',
    stopped: '已停止'
  }[value] || value;
}

function statusClass(value) {
  return {
    running: 'status-running',
    done: 'status-done',
    failed: 'status-failed',
    stopped: 'status-stopped'
  }[value] || '';
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
