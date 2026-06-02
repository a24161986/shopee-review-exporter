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
      const { retryRunId, ...taskWithoutRetryRunId } = task || {};
      const retrySelected = retryRunId !== null && typeof retryRunId !== 'undefined';
      if (status === TASK_STATUS.RUNNING || (status === TASK_STATUS.PENDING && retrySelected)) {
        return { ...taskWithoutRetryRunId, status: TASK_STATUS.FAILED, error: '已停止' };
      }
      if (task?.status === 'stopped') {
        return { ...taskWithoutRetryRunId, status: TASK_STATUS.FAILED, error: task.error || '已停止' };
      }
      return { ...taskWithoutRetryRunId, status };
    });
  }

  function prepareTasksForRestore(tasks = [], runId) {
    return tasks.map((task) => {
      const status = normalizeTaskStatus(task?.status);
      const restoredStatus = status === TASK_STATUS.RUNNING
        ? TASK_STATUS.PENDING
        : status;
      const { retryRunId, ...taskWithoutRetryRunId } = task || {};
      const retrySelected = retryRunId !== null && typeof retryRunId !== 'undefined';
      if (retrySelected && (status === TASK_STATUS.PENDING || status === TASK_STATUS.RUNNING)) {
        return { ...taskWithoutRetryRunId, status: restoredStatus, retryRunId: runId };
      }
      return { ...taskWithoutRetryRunId, status: restoredStatus };
    });
  }

  function resetFailedTasksForRetry(tasks = []) {
    let retryCount = 0;
    const resetTasks = tasks.map((task) => {
      const status = normalizeTaskStatus(task?.status);
      const { retryRunId, ...taskWithoutRetryRunId } = task || {};
      if (status !== TASK_STATUS.FAILED) {
        return { ...taskWithoutRetryRunId, status, retry: false };
      }
      retryCount += 1;
      return {
        ...taskWithoutRetryRunId,
        status: TASK_STATUS.PENDING,
        fetched: 0,
        pageFetches: [],
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
    prepareTasksForRestore,
    resetFailedTasksForRetry,
    hasFailedTasks
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ShopeeReviewExporter = Object.assign(global.ShopeeReviewExporter || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
