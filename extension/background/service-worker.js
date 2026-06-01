importScripts(
  '../lib/fflate.min.js',
  '../shared/shopee-sites.js',
  '../shared/reviews.js',
  '../shared/export-format.js',
  '../shared/xlsx-export.js'
);

const DEFAULT_LIMIT = 50;
const PAGE_LOAD_TIMEOUT_MS = 30000;
const RUNTIME_SETTLE_MS = 5000;
const BETWEEN_PAGE_DELAY_MS = 800;
const STORAGE_KEY = 'shopeeReviewExporterState';
const QUEUE_ALARM_NAME = 'shopeeReviewExporterQueue';

let state = {
  running: false,
  paused: false,
  stopped: false,
  currentTabId: null,
  tasks: [],
  message: '就绪'
};

let activeRunId = 0;
let stoppingPromise = null;
let activeQueuePromise = null;
const initializationPromise = initializeFromStorage();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== QUEUE_ALARM_NAME) return;
  initializationPromise
    .then(() => continueQueue())
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_EXPORT') {
    initializationPromise
      .then(() => startExport(message.products || [], message.settings || {}))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message.type === 'PAUSE_EXPORT') {
    initializationPromise
      .then(() => pauseExport())
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message.type === 'RESUME_EXPORT') {
    initializationPromise
      .then(() => resumeExport())
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message.type === 'STOP_EXPORT') {
    initializationPromise
      .then(() => stopExport())
      .finally(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'GET_STATE') {
    initializationPromise
      .then(() => sendResponse(snapshotState()))
      .catch(() => sendResponse(snapshotState()));
    return true;
  }

  return false;
});

async function startExport(products, settings) {
  if (state.running || state.currentTabId !== null) {
    await stopExport();
  }

  const target = clampCount(settings.count);
  const format = settings.format === 'json' ? 'json' : 'xlsx';
  const tasks = products.map((product, index) => ({
    ...product,
    id: `${product.key || `${product.domain}:${product.shopId}:${product.itemId}`}:${index}`,
    status: 'pending',
    fetched: 0,
    target,
    filter: Number(settings.filter || 0),
    format,
    error: ''
  }));

  if (tasks.length === 0) {
    activeRunId += 1;
    await clearQueueAlarm();
    state = {
      running: false,
      paused: false,
      stopped: false,
      currentTabId: null,
      tasks: [],
      message: '没有可导出的商品'
    };
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
    tasks,
    message: `准备导出 ${tasks.length} 个商品`
  };
  publishState();
  continueQueue(runId);
}

async function pauseExport() {
  state.paused = true;
  state.message = '已暂停';
  await clearQueueAlarm();
  publishState();
}

async function resumeExport() {
  state.paused = false;
  state.message = '继续导出';
  publishState();
  continueQueue();
}

async function stopExport() {
  if (stoppingPromise) return stoppingPromise;

  stoppingPromise = (async () => {
    activeRunId += 1;
    activeQueuePromise = null;
    state.stopped = true;
    state.paused = false;
    state.running = false;
    state.message = '已停止';

    for (const task of state.tasks) {
      if (task.status === 'pending' || task.status === 'running') {
        task.status = 'stopped';
      }
    }

    await closeCurrentTab();
    await clearQueueAlarm();
    publishState();
  })();

  try {
    await stoppingPromise;
  } finally {
    stoppingPromise = null;
  }
}

async function runQueue(runId) {
  for (const task of state.tasks) {
    if (!isActiveRun(runId) || state.stopped) break;
    await waitWhilePaused(runId);
    if (!isActiveRun(runId) || state.stopped) break;
    if (task.status !== 'pending') continue;

    task.status = 'running';
    task.error = '';
    state.message = `正在导出 ${task.marketplace} ${task.shopId}.${task.itemId}`;
    publishState();

    try {
      await processTask(runId, task);
      if (!isActiveRun(runId)) return;
      task.status = 'done';
      state.message = `已完成 ${task.shopId}.${task.itemId}`;
    } catch (error) {
      if (!isActiveRun(runId)) return;
      task.status = state.stopped ? 'stopped' : 'failed';
      task.error = error.message || String(error);
      state.message = state.stopped ? '已停止' : `导出失败：${task.error}`;
    } finally {
      if (isActiveRun(runId)) {
        await closeCurrentTab();
        publishState();
      }
    }
  }

  if (!isActiveRun(runId)) return;

  state.running = false;
  state.paused = false;
  state.message = state.stopped ? '已停止' : '全部任务完成';
  await clearQueueAlarm();
  publishState();
}

function continueQueue(runId = activeRunId) {
  if (!state.running || state.paused || state.stopped) {
    if (state.paused || state.stopped) clearQueueAlarm().catch(() => {});
    return;
  }

  scheduleQueueAlarm().catch(() => {});

  if (activeQueuePromise) return;
  const queuePromise = runQueue(runId)
    .catch((error) => {
      if (!isActiveRun(runId)) return;
      state.running = false;
      state.message = `导出失败：${error.message || String(error)}`;
      clearQueueAlarm().catch(() => {});
      publishState();
    })
    .finally(() => {
      if (activeQueuePromise === queuePromise) {
        activeQueuePromise = null;
      }
    });
  activeQueuePromise = queuePromise;
}

async function processTask(runId, task) {
  assertActiveRun(runId);
  const tab = await chrome.tabs.create({ url: task.url, active: false });
  if (!isActiveRun(runId) || state.stopped) {
    await closeTabId(tab.id);
    throw new Error('已停止');
  }

  state.currentTabId = tab.id;
  publishState();

  try {
    await waitForTabComplete(runId, tab.id);
    await sleepInterruptibly(runId, RUNTIME_SETTLE_MS);

    const rawReviews = [];
    let offset = 0;

    while (rawReviews.length < task.target) {
      assertActiveRun(runId);
      await waitWhilePaused(runId);
      assertActiveRun(runId);

      const payload = await fetchReviewPage(tab.id, task, offset, DEFAULT_LIMIT);
      assertActiveRun(runId);

      const pageReviews = payload?.data?.ratings || [];
      if (!Array.isArray(pageReviews) || pageReviews.length === 0) break;

      rawReviews.push(...pageReviews);
      task.fetched = Math.min(rawReviews.length, task.target);
      publishState();

      if (pageReviews.length < DEFAULT_LIMIT) break;
      offset += DEFAULT_LIMIT;
      await sleepInterruptibly(runId, BETWEEN_PAGE_DELAY_MS);
    }

    const limitedReviews = rawReviews.slice(0, task.target);
    const rows = ShopeeReviewExporter.normalizeReviewsForExport(task, limitedReviews);
    await downloadRows(task, rows);
  } finally {
    await closeTabId(tab.id);
  }
}

async function fetchReviewPage(tabId, task, offset, limit) {
  const apiPath = [
    '/api/v2/item/get_ratings?',
    `exclude_filter=1&filter=${encodeURIComponent(task.filter)}`,
    '&filter_size=0&flag=1&fold_filter=0',
    `&itemid=${encodeURIComponent(task.itemId)}`,
    `&limit=${encodeURIComponent(limit)}`,
    `&offset=${encodeURIComponent(offset)}`,
    '&relevant_reviews=false&request_source=2',
    `&shopid=${encodeURIComponent(task.shopId)}`,
    '&tag_filter=&type=0'
  ].join('');

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (url) => {
      const response = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    args: [apiPath]
  });

  if (result?.error) {
    throw new Error(result.error.message || '评论接口执行失败');
  }
  if (!result?.result) {
    throw new Error('评论接口没有返回数据');
  }

  return result.result;
}

async function downloadRows(task, rows) {
  const extension = task.format === 'json' ? 'json' : 'xlsx';
  const filename = ShopeeReviewExporter.buildDownloadFilename(task, rows.length, extension);
  const url = task.format === 'json'
    ? ShopeeReviewExporter.jsonDataUrl(rows)
    : ShopeeReviewExporter.excelDataUrl(rows);

  await chrome.downloads.download({ url, filename, saveAs: false });
}

async function waitForTabComplete(runId, tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'complete') return;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('商品页加载超时'));
    }, PAGE_LOAD_TIMEOUT_MS);
    const activeTimer = setInterval(() => {
      if (isActiveRun(runId)) return;
      cleanup();
      reject(new Error('已停止'));
    }, 300);

    function listener(updatedTabId, changeInfo) {
      if (!isActiveRun(runId)) {
        cleanup();
        reject(new Error('已停止'));
        return;
      }

      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        cleanup();
        resolve();
      }
    }

    function cleanup() {
      clearTimeout(timer);
      clearInterval(activeTimer);
      chrome.tabs.onUpdated.removeListener(listener);
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function waitWhilePaused(runId) {
  while (isActiveRun(runId) && state.paused && !state.stopped) {
    await sleep(300);
  }
  assertActiveRun(runId);
}

async function closeCurrentTab() {
  if (state.currentTabId === null) return;
  await closeTabId(state.currentTabId);
}

async function closeTabId(tabId) {
  if (tabId === null || typeof tabId === 'undefined') return;
  if (state.currentTabId === tabId) {
    state.currentTabId = null;
  }
  await chrome.tabs.remove(tabId).catch(() => {});
}

async function sleepInterruptibly(runId, ms) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ms) {
    assertActiveRun(runId);
    await sleep(Math.min(300, ms - (Date.now() - startedAt)));
  }
}

function assertActiveRun(runId) {
  if (!isActiveRun(runId) || state.stopped) {
    throw new Error('已停止');
  }
}

function isActiveRun(runId) {
  return runId === activeRunId;
}

function clampCount(value) {
  const number = Number(value || 100);
  if (!Number.isFinite(number)) return 100;
  return Math.max(1, Math.min(5000, Math.floor(number)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initializeFromStorage() {
  const saved = await loadPersistedState();
  if (!saved) return;

  state = {
    running: Boolean(saved.running),
    paused: Boolean(saved.paused),
    stopped: Boolean(saved.stopped),
    currentTabId: null,
    tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
    message: saved.message || '就绪'
  };

  if (state.running && !state.stopped) {
    activeRunId += 1;
    for (const task of state.tasks) {
      if (task.status === 'running') {
        task.status = 'pending';
      }
    }
    state.message = '恢复导出队列';
    publishState();

    if (state.paused) {
      await clearQueueAlarm();
    } else {
      continueQueue(activeRunId);
    }
    return;
  }

  if (state.paused || state.stopped || !state.running) {
    await clearQueueAlarm();
  }
}

async function loadPersistedState() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const saved = result?.[STORAGE_KEY];
    return saved && typeof saved === 'object' ? saved : null;
  } catch {
    return null;
  }
}

function persistState(snapshot) {
  chrome.storage.local.set({ [STORAGE_KEY]: snapshot }).catch(() => {});
}

async function scheduleQueueAlarm(delayInMinutes = 1) {
  await chrome.alarms.create(QUEUE_ALARM_NAME, { delayInMinutes });
}

async function clearQueueAlarm() {
  await chrome.alarms.clear(QUEUE_ALARM_NAME).catch(() => {});
}

function snapshotState() {
  return {
    running: state.running,
    paused: state.paused,
    stopped: state.stopped,
    currentTabId: state.currentTabId,
    tasks: state.tasks,
    message: state.message
  };
}

function publishState() {
  const snapshot = snapshotState();
  chrome.runtime.sendMessage({ type: 'EXPORT_STATE', state: snapshot }).catch(() => {});
  persistState(snapshot);

  if (snapshot.running && !snapshot.paused && !snapshot.stopped) {
    scheduleQueueAlarm().catch(() => {});
  } else {
    clearQueueAlarm().catch(() => {});
  }
}
