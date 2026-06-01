const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const serviceWorker = fs.readFileSync(path.join(root, 'extension/background/service-worker.js'), 'utf8');

test('background imports task state helpers and handles retry failed command', () => {
  const scriptsBlock = serviceWorker.match(/importScripts\(([\s\S]*?)\);/)?.[1] || '';
  const reviewFilterIndex = scriptsBlock.indexOf("'../shared/review-filter.js'");
  const taskStateIndex = scriptsBlock.indexOf("'../shared/task-state.js'");
  const reviewsIndex = scriptsBlock.indexOf("'../shared/reviews.js'");

  assert.notEqual(reviewFilterIndex, -1);
  assert.notEqual(taskStateIndex, -1);
  assert.notEqual(reviewsIndex, -1);
  assert.ok(reviewFilterIndex < taskStateIndex);
  assert.ok(taskStateIndex < reviewsIndex);

  const retryIndex = serviceWorker.indexOf("message.type === 'RETRY_FAILED'");
  const getStateIndex = serviceWorker.indexOf("message.type === 'GET_STATE'");

  assert.notEqual(retryIndex, -1);
  assert.notEqual(getStateIndex, -1);
  assert.ok(retryIndex < getStateIndex);
  assert.equal(serviceWorker.includes('.then(() => retryFailedTasks())'), true);
});

test('background retries failed tasks with simplified task statuses', () => {
  assert.equal(serviceWorker.includes("task.status = 'stopped'"), false);
  assert.equal(serviceWorker.includes("state.stopped ? 'stopped' : 'failed'"), false);
  assert.equal(serviceWorker.includes('ShopeeReviewExporter.prepareTasksForStop(state.tasks)'), true);
  assert.match(serviceWorker, /async function retryFailedTasks\(\) \{[\s\S]*ShopeeReviewExporter\.resetFailedTasksForRetry\(state\.tasks\)[\s\S]*retryRunId/);
  assert.equal(serviceWorker.includes('ShopeeReviewExporter.TASK_STATUS.PENDING'), true);
  assert.equal(serviceWorker.includes('ShopeeReviewExporter.TASK_STATUS.RUNNING'), true);
  assert.equal(serviceWorker.includes('ShopeeReviewExporter.TASK_STATUS.DONE'), true);
  assert.equal(serviceWorker.includes('ShopeeReviewExporter.TASK_STATUS.FAILED'), true);
});

test('background normalizes restored statuses and reports final queue summary', () => {
  assert.equal(serviceWorker.includes('ShopeeReviewExporter.normalizeTaskStatus(task.status)'), true);
  assert.equal(serviceWorker.includes('ShopeeReviewExporter.summarizeTasks(state.tasks)'), true);
  assert.equal(serviceWorker.includes('全部任务完成'), false);
});
