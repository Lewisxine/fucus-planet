/**
 * FocusPlanet 新标签页仪表盘逻辑
 *
 * 展示实时时钟、今日专注数据、本周趋势柱状图、健康提醒状态，
 * 并提供「开始专注」快捷按钮。数据来自 chrome.storage.local，
 * 动作通过 chrome.runtime.sendMessage 交给后台。
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  let state = {
    timer: { mode: 'idle', status: 'idle' },
    settings: {},
    stats: { daily: {}, streak: 0, lastFocusDate: null },
    streak: 0
  };

  // ------------------------------------------------------------------
  // 工具函数
  // ------------------------------------------------------------------

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function currentStreak(stats) {
    const today = localDateKey();
    const yesterday = localDateKey(new Date(Date.now() - 86400000));
    if (!stats.lastFocusDate) return 0;
    if (stats.lastFocusDate === today || stats.lastFocusDate === yesterday) return stats.streak || 0;
    return 0;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function formatMinutes(seconds) {
    return Math.round(seconds / 60);
  }

  // ------------------------------------------------------------------
  // 时钟
  // ------------------------------------------------------------------

  function renderClock() {
    const now = new Date();
    $('clock').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    $('date-line').textContent =
      `${now.getMonth() + 1}月${now.getDate()}日 星期${WEEKDAYS[now.getDay()]}`;

    const h = now.getHours();
    let greeting;
    if (h < 6) greeting = '夜深了，注意休息';
    else if (h < 12) greeting = '早上好，开始专注吧';
    else if (h < 18) greeting = '下午好，专注会让你更高效';
    else greeting = '晚上好，把今天的任务收个尾';
    $('greeting').textContent = greeting;
  }

  setInterval(renderClock, 1000);
  renderClock();

  // ------------------------------------------------------------------
  // 数据加载与渲染
  // ------------------------------------------------------------------

  async function load() {
    const res = await chrome.storage.local.get(['timer', 'settings', 'stats']);
    state.timer = res.timer || { mode: 'idle', status: 'idle' };
    state.settings = res.settings || {};
    state.stats = res.stats || { daily: {}, streak: 0, lastFocusDate: null };
    state.streak = currentStreak(state.stats);
    render();
  }

  function render() {
    // 今日专注数据
    const today = localDateKey();
    const day = (state.stats.daily || {})[today] || { focusSeconds: 0, pomodoros: 0 };
    $('today-focus').textContent = formatMinutes(day.focusSeconds);
    $('today-pomodoros').textContent = day.pomodoros;
    $('today-streak').textContent = state.streak;

    // 开始专注按钮状态
    const btn = $('btn-start');
    if (state.timer.status === 'running') {
      btn.textContent = state.timer.mode === 'focus' ? '专注中…点击暂停' : '休息中…点击暂停';
      btn.classList.add('is-running');
    } else if (state.timer.status === 'paused') {
      btn.textContent = '继续计时';
      btn.classList.remove('is-running');
    } else {
      btn.textContent = '开始专注';
      btn.classList.remove('is-running');
    }

    renderTrend();
    renderHealth();
  }

  /** 渲染最近 7 天的专注时长柱状图 */
  function renderTrend() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        key: localDateKey(d),
        label: i === 0 ? '今天' : '周' + WEEKDAYS[d.getDay()],
        isToday: i === 0
      });
    }

    const daily = state.stats.daily || {};
    const values = days.map((d) => (daily[d.key] ? daily[d.key].focusSeconds : 0));
    const maxVal = Math.max(1, ...values);

    const trend = $('trend');
    trend.innerHTML = '';

    days.forEach((d, idx) => {
      const seconds = values[idx];
      const minutes = formatMinutes(seconds);
      const heightPct = Math.max(2, Math.round((seconds / maxVal) * 100));

      const col = document.createElement('div');
      col.className = 'trend-col' + (d.isToday ? ' today' : '');
      col.innerHTML =
        `<div class="trend-val">${minutes}</div>` +
        `<div class="trend-track"><div class="trend-bar" style="height:${heightPct}%"></div></div>` +
        `<div class="trend-label">${d.label}</div>`;
      trend.appendChild(col);
    });
  }

  /** 渲染健康提醒状态 */
  function renderHealth() {
    const s = state.settings;
    const items = [
      { emoji: '💧', name: '喝水', desc: `每 ${s.waterInterval || 30} 分钟`, on: s.waterEnabled },
      { emoji: '🧘', name: '久坐', desc: `每 ${s.sedentaryInterval || 60} 分钟`, on: s.sedentaryEnabled },
      { emoji: '👀', name: '护眼', desc: '20-20-20 法则', on: s.eyeEnabled }
    ];

    const list = $('health-list');
    list.innerHTML = '';
    for (const it of items) {
      const li = document.createElement('li');
      li.className = 'health-item';
      li.innerHTML =
        `<span class="health-emoji">${it.emoji}</span>` +
        `<div class="health-info"><div class="health-name">${it.name}</div>` +
        `<div class="health-desc">${it.desc}</div></div>` +
        `<span class="health-state ${it.on ? 'on' : 'off'}">${it.on ? '已开启' : '已关闭'}</span>`;
      list.appendChild(li);
    }
  }

  // 后台状态变化实时刷新
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

  $('btn-start').addEventListener('click', async () => {
    const t = state.timer;
    if (t.status === 'running') {
      await chrome.runtime.sendMessage({ type: 'PAUSE' });
    } else if (t.status === 'paused') {
      await chrome.runtime.sendMessage({ type: 'RESUME' });
    } else {
      await chrome.runtime.sendMessage({ type: 'START_FOCUS' });
    }
  });

  $('open-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  load();
})();
