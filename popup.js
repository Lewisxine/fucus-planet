/**
 * FocusPlanet 弹窗逻辑
 *
 * 展示番茄钟状态与倒计时、今日统计、健康提醒快捷开关，
 * 并可打开设置页。所有动作通过 chrome.runtime.sendMessage 交给后台，
 * 状态通过 chrome.storage 直接读取 + onChanged 实时刷新。
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const MODE_LABEL = {
    focus: '专注中',
    shortBreak: '短休息',
    longBreak: '长休息',
    idle: '准备就绪'
  };

  let state = {
    timer: { mode: 'idle', status: 'idle', endsAt: null },
    settings: {},
    stats: { daily: {}, streak: 0, lastFocusDate: null },
    streak: 0
  };

  // ------------------------------------------------------------------
  // 数据加载与渲染
  // ------------------------------------------------------------------

  async function load() {
    const res = await chrome.storage.local.get(['timer', 'settings', 'stats']);
    state.timer = res.timer || { mode: 'idle', status: 'idle', endsAt: null, remaining: 0, total: 0 };
    state.settings = res.settings || {};
    state.stats = res.stats || { daily: {}, streak: 0, lastFocusDate: null };
    state.streak = currentStreak(state.stats);
    render();
  }

  /** 连续天数：最后专注日不是今天/昨天则视为中断 */
  function currentStreak(stats) {
    const today = localDateKey();
    const yesterday = localDateKey(new Date(Date.now() - 86400000));
    if (!stats.lastFocusDate) return 0;
    if (stats.lastFocusDate === today || stats.lastFocusDate === yesterday) return stats.streak || 0;
    return 0;
  }

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatMs(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function render() {
    const t = state.timer;
    const s = state.settings;

    // 模式标签
    $('mode-label').textContent = MODE_LABEL[t.mode] || '准备就绪';

    // 时间显示
    if (t.status === 'running' && t.endsAt) {
      $('time-display').textContent = formatMs(t.endsAt - Date.now());
    } else if (t.status === 'paused') {
      $('time-display').textContent = formatMs(t.remaining || 0);
    } else {
      const minutes = (s.focusMinutes || 25);
      $('time-display').textContent = `${String(minutes).padStart(2, '0')}:00`;
    }

    // 主按钮文字
    const btn = $('btn-main');
    if (t.status === 'running') {
      btn.textContent = '暂停';
    } else if (t.status === 'paused') {
      btn.textContent = '继续';
    } else {
      btn.textContent = '开始专注';
    }

    // 统计
    const today = localDateKey();
    const day = (state.stats.daily || {})[today] || { focusSeconds: 0, pomodoros: 0 };
    $('stat-focus').textContent = Math.round(day.focusSeconds / 60) + ' 分';
    $('stat-pomodoros').textContent = day.pomodoros;
    $('stat-streak').textContent = state.streak + ' 天';

    // 健康提醒开关
    $('toggle-water').checked = !!s.waterEnabled;
    $('toggle-sedentary').checked = !!s.sedentaryEnabled;
    $('toggle-eye').checked = !!s.eyeEnabled;
  }

  // 每 500ms 本地刷新倒计时（仅在运行中显示秒级跳动）
  setInterval(() => {
    const t = state.timer;
    if (t && t.status === 'running' && t.endsAt) {
      $('time-display').textContent = formatMs(t.endsAt - Date.now());
      if (t.endsAt - Date.now() <= 0) load(); // 到期后从后台拉取最新状态
    }
  }, 500);

  // 后台状态变化时实时刷新
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.timer) state.timer = changes.timer.newValue || { mode: 'idle', status: 'idle' };
    if (changes.settings) state.settings = changes.settings.newValue || {};
    if (changes.stats) {
      state.stats = changes.stats.newValue || {};
      state.streak = currentStreak(state.stats);
    }
    render();
  });

  // ------------------------------------------------------------------
  // 交互
  // ------------------------------------------------------------------

  $('btn-main').addEventListener('click', async () => {
    const t = state.timer;
    if (t.status === 'running') {
      await chrome.runtime.sendMessage({ type: 'PAUSE' });
    } else if (t.status === 'paused') {
      await chrome.runtime.sendMessage({ type: 'RESUME' });
    } else {
      await chrome.runtime.sendMessage({ type: 'START_FOCUS' });
    }
  });

  $('btn-reset').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'RESET' });
  });

  $('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  function bindToggle(id, key) {
    $(id).addEventListener('change', (e) => {
      chrome.runtime.sendMessage({ type: 'TOGGLE_REMINDER', key, enabled: e.target.checked });
    });
  }
  bindToggle('toggle-water', 'water');
  bindToggle('toggle-sedentary', 'sedentary');
  bindToggle('toggle-eye', 'eye');

  load();
})();
