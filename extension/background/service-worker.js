importScripts(
  '../lib/fflate.min.js',
  '../shared/shopee-sites.js',
  '../shared/reviews.js',
  '../shared/export-format.js'
);

const DEFAULT_LIMIT = 50;
const PAGE_LOAD_TIMEOUT_MS = 30000;
const RUNTIME_SETTLE_MS = 5000;
const BETWEEN_PAGE_DELAY_MS = 800;
const EXCEL_HEADERS = [
  '商品链接',
  '站点',
  '店铺ID',
  '商品ID',
  '评论人',
  '评分',
  '评论内容',
  '规格/变体',
  '评论时间',
  '图片链接',
  '视频链接'
];

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_EXPORT') {
    startExport(message.products || [], message.settings || {})
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message.type === 'PAUSE_EXPORT') {
    state.paused = true;
    state.message = '已暂停';
    publishState();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'RESUME_EXPORT') {
    state.paused = false;
    state.message = '继续导出';
    publishState();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'STOP_EXPORT') {
    stopExport().catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'GET_STATE') {
    sendResponse(snapshotState());
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
  runQueue(runId).catch((error) => {
    if (!isActiveRun(runId)) return;
    state.running = false;
    state.message = `导出失败：${error.message || String(error)}`;
    publishState();
  });
}

async function stopExport() {
  if (stoppingPromise) return stoppingPromise;

  stoppingPromise = (async () => {
    activeRunId += 1;
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
  publishState();
}

async function processTask(runId, task) {
  assertActiveRun(runId);
  const tab = await chrome.tabs.create({ url: task.url, active: false });
  state.currentTabId = tab.id;
  publishState();

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
    : excelDataUrl(rows);

  await chrome.downloads.download({ url, filename, saveAs: false });
}

function excelDataUrl(rows) {
  const rowsForExcel = ShopeeReviewExporter.toExcelRows(rows);
  const headers = rowsForExcel.length ? Object.keys(rowsForExcel[0]) : EXCEL_HEADERS;
  const sheetRows = [
    headers,
    ...rowsForExcel.map((row) => headers.map((header) => row[header] ?? ''))
  ];
  const files = buildXlsxFiles(sheetRows);
  const zipped = fflate.zipSync(files);
  const base64 = uint8ToBase64(zipped);

  return `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
}

function buildXlsxFiles(sheetRows) {
  return {
    '[Content_Types].xml': fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    '_rels/.rels': fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/_rels/workbook.xml.rels': fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/workbook.xml': fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Reviews" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`),
    'xl/styles.xml': fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`),
    'xl/worksheets/sheet1.xml': fflate.strToU8(buildWorksheetXml(sheetRows))
  };
}

function buildWorksheetXml(rows) {
  const columnWidths = [36, 14, 14, 14, 18, 8, 48, 24, 20, 48, 48]
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join('');
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
    }).join('');

    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${columnWidths}</cols>
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

function columnName(number) {
  let name = '';
  while (number > 0) {
    const modulo = (number - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    number = Math.floor((number - modulo) / 26);
  }
  return name;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function uint8ToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
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

  const tabId = state.currentTabId;
  state.currentTabId = null;
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
  chrome.runtime.sendMessage({ type: 'EXPORT_STATE', state: snapshotState() }).catch(() => {});
}
