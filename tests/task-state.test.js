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
    { id: 'a', status: 'done', fetched: 10, error: '', retryRunId: 41 },
    { id: 'b', status: 'failed', fetched: 3, error: 'HTTP 403', retryRunId: 42 },
    { id: 'c', status: 'pending', fetched: 0, error: '', retryRunId: 43 }
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
  assert.deepEqual(result.tasks.map((task) => Object.hasOwn(task, 'retryRunId')), [
    false,
    false,
    false
  ]);
});

test('hasFailedTasks detects failed tasks after normalizing legacy stopped status', () => {
  assert.equal(hasFailedTasks([{ status: 'done' }]), false);
  assert.equal(hasFailedTasks([{ status: 'stopped' }]), true);
});
