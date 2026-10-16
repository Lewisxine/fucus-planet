/**
 * FocusPlanet（专注星球）后台 Service Worker
 *
 * 职责：
 *  1. 番茄钟状态机（专注 / 短休息 / 长休息）
 *  2. 通过 chrome.alarms 精确触发计时结束，并在专注期间更新图标角标
 *  3. 健康提醒（喝水 / 久坐 / 护眼）定时通知
 *  4. 学习统计（今日专注时长、番茄数、连续天数、每日趋势）
 *  5. 黑名单增删与网站拦截所需的共享数据（真正拦截由 content.js 完成）
 *  6. 作为消息中枢，响应 popup / newtab / options 的请求
 *
 * 设计要点：所有状态都持久化到 chrome.storage.local，
 * 保证 Service Worker 被浏览器回收后计时与数据不丢失。
 */

// ---------------------------------------------------------------------------
// 常量与默认配置
// ---------------------------------------------------------------------------

/** 默认设置（首次安装或数据清除后使用） */
const DEFAULT_SETTINGS = {
  focusMinutes: 25,        // 专注时长（分钟）
  shortBreakMinutes: 5,    // 短休息时长（分钟）
  longBreakMinutes: 15,    // 长休息时长（分钟）
  longBreakInterval: 4,    // 每完成多少个番茄进入一次长休息
  waterEnabled: true,      // 喝水提醒开关
  waterInterval: 30,       // 喝水提醒间隔（分钟）
  sedentaryEnabled: true,  // 久坐提醒开关
  sedentaryInterval: 60,   // 久坐提醒间隔（分钟）
  eyeEnabled: true,        // 护眼提醒开关（20-20-20）
  eyeInterval: 20          // 护眼提醒间隔（分钟）
};

/** 提醒文案（温和、有趣，避免闹钟式催促） */
const WATER_MSGS = [
  '该喝水啦～补充一点水分，大脑会转得更快哦',
  '起来接杯水吧，顺便活动一下肩膀',
  '小星球提醒：水分不足会让专注力偷偷溜走'
];
const SEDENTARY_MSGS = [
  '坐了好久了，起来伸个懒腰吧',
  '你的腰在喊救命啦，站起来走两步',
  '离开椅子 2 分钟，回来效率翻倍'
];
const EYE_MSGS = [
  '20-20-20：看看 20 英尺外，让眼睛放个假',
  '眼睛也需要下课铃，眺望远处 20 秒吧',
  '眨眨眼、看看窗外，让眼睛呼吸一下'
];

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 将 chrome.storage.local 的回调式 API 包装成 Promise，便于 async/await 使用 */
const storage = {
  get(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  },
  set(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  },
  clear() {
    return new Promise((resolve) => chrome.storage.local.clear(resolve));
  }
};

/** 生成本地时区的日期键，形如 YYYY-MM-DD（避免 toISOString 的 UTC 偏移） */
function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 从数组中随机取一项 */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 将数值解析为整数并限制在 [min, max] 区间内 */
function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** 域名归一化：转小写、去协议/路径/端口/www 前缀 */
function normalizeDomain(input) {
  let d = String(input || '').trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^[a-z]+:\/\//, '');   // 去掉 http:// 或 https://
  d = d.replace(/^www\./, '');          // 去掉 www. 前缀
  d = d.split('/')[0];                  // 去掉路径
  d = d.split('?')[0];                  // 去掉查询串
  d = d.split('#')[0];                  // 去掉锚点
  d = d.split('@').pop();               // 去掉 user:pass@（需先于端口处理）
  d = d.split(':')[0];                  // 去掉端口
  d = d.trim();
  // 基本校验：仅含域名合法字符，且必须包含一个点（如 example.com）
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) {
    return null;
  }
  return d;
}

/** 发送一条系统通知 */
function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 1
  });
}

// ---------------------------------------------------------------------------
// 状态读写
// ---------------------------------------------------------------------------

/** 读取番茄钟状态，缺失时返回一个安全的空闲状态 */
async function getTimer() {
  const res = await storage.get('timer');
  return res.timer || { mode: 'idle', status: 'idle', endsAt: null, remaining: 0, total: 0, cycleCount: 0 };
}

/** 读取设置（合并默认值） */
async function getSettings() {
  const res = await storage.get('settings');
  return { ...DEFAULT_SETTINGS, ...(res.settings || {}) };
}

/** 计算当前「连续专注天数」：若最后专注日不是今天或昨天，则视为已中断 */
function currentStreak(stats) {
  const today = localDateKey();
  const yesterday = localDateKey(new Date(Date.now() - 86400000));
  if (!stats || !stats.lastFocusDate) return 0;
  if (stats.lastFocusDate === today || stats.lastFocusDate === yesterday) {
    return stats.streak || 0;
  }
  return 0;
}

/** 返回完整状态，供各前端页面初始化展示 */
async function getFullState() {
  const res = await storage.get(['timer', 'stats', 'settings', 'blacklist']);
  const stats = res.stats || { daily: {}, streak: 0, lastFocusDate: null };
  return {
    timer: res.timer || { mode: 'idle', status: 'idle', endsAt: null, remaining: 0, total: 0, cycleCount: 0 },
    stats,
    settings: { ...DEFAULT_SETTINGS, ...(res.settings || {}) },
    blacklist: res.blacklist || [],
    streak: currentStreak(stats)
  };
}

// ---------------------------------------------------------------------------
// 图标角标：专注期间显示剩余分钟数
// ---------------------------------------------------------------------------

async function updateBadge() {
  const timer = await getTimer();
  if (timer.mode === 'focus' && timer.status === 'running' && timer.endsAt) {
    const remainingMs = Math.max(0, timer.endsAt - Date.now());
    const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
    chrome.action.setBadgeText({ text: String(minutes) });
    chrome.action.setBadgeBackgroundColor({ color: '#0ea5e9' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ---------------------------------------------------------------------------
// 番茄钟状态机
// ---------------------------------------------------------------------------

/** 启动一个计时阶段（focus / shortBreak / longBreak） */
async function startTimer(mode) {
  const settings = await getSettings();
  const cur = await getTimer();

  let minutes;
  if (mode === 'focus') minutes = settings.focusMinutes;
  else if (mode === 'shortBreak') minutes = settings.shortBreakMinutes;
  else minutes = settings.longBreakMinutes;

  const total = Math.max(1, minutes) * 60 * 1000;
  const timer = {
    mode,
    status: 'running',
    endsAt: Date.now() + total,
    remaining: total,
    total,
    // 进入长休息时清零周期计数，其余阶段保留计数（用于判断何时长休息）
    cycleCount: mode === 'longBreak' ? 0 : (cur.cycleCount || 0)
  };

  await storage.set({ timer });
  // 用 when（绝对时间戳）精确触发结束，避免 SW 睡眠导致计时不准
  chrome.alarms.create('timer-end', { when: timer.endsAt });
  // 每分钟刷新一次角标
  chrome.alarms.create('timer-tick', { periodInMinutes: 1 });
  await updateBadge();
}

/** 暂停：记录剩余时长，清除结束与角标闹钟 */
async function pauseTimer() {
  const timer = await getTimer();
  if (timer.status !== 'running') return;
  timer.status = 'paused';
  timer.remaining = Math.max(0, timer.endsAt - Date.now());
  timer.endsAt = null;
  await storage.set({ timer });
  chrome.alarms.clear('timer-end');
  chrome.alarms.clear('timer-tick');
  await updateBadge();
}

/** 继续：基于剩余时长重新计算结束时间 */
async function resumeTimer() {
  const timer = await getTimer();
  if (timer.status !== 'paused') return;
  timer.status = 'running';
  timer.endsAt = Date.now() + timer.remaining;
  await storage.set({ timer });
  chrome.alarms.create('timer-end', { when: timer.endsAt });
  chrome.alarms.create('timer-tick', { periodInMinutes: 1 });
  await updateBadge();
}

/** 重置：回到空闲状态并清理所有计时闹钟与角标 */
async function resetTimer() {
  await storage.set({
    timer: { mode: 'idle', status: 'idle', endsAt: null, remaining: 0, total: 0, cycleCount: 0 }
  });
  chrome.alarms.clear('timer-end');
  chrome.alarms.clear('timer-tick');
  await updateBadge();
}

/** 专注完成后：记录统计，并按周期规则进入短/长休息 */
async function onFocusFinished(timer) {
  await recordFocus(timer.total);

  const settings = await getSettings();
  const cycle = (timer.cycleCount || 0) + 1;
  // 先把递增后的周期计数写回，供 startTimer 读取
  timer.cycleCount = cycle;
  await storage.set({ timer });

  if (cycle >= (settings.longBreakInterval || 4)) {
    notify('专注完成，漂亮！', '完成了一组番茄，来个长休息，好好放松一下吧');
    await startTimer('longBreak');
  } else {
    notify('专注完成', '干得漂亮！起来喝口水，休息几分钟再继续');
    await startTimer('shortBreak');
  }
}

/** 休息完成后：回到空闲状态，等待用户开始下一轮专注 */
async function onBreakFinished() {
  notify('休息结束', '精力回满了，开始下一轮专注吧');
  await resetTimer();
}

/** 处理 timer-end 闹钟 */
async function handleTimerEnd() {
  const timer = await getTimer();
  if (timer.status !== 'running') return;

  chrome.alarms.clear('timer-end');
  chrome.alarms.clear('timer-tick');

  if (timer.mode === 'focus') {
    await onFocusFinished(timer);
  } else {
    await onBreakFinished();
  }
}

// ---------------------------------------------------------------------------
// 学习统计
// ---------------------------------------------------------------------------

/** 记录一次完整专注（把该阶段总时长计入今日专注时长与番茄数） */
async function recordFocus(ms) {
  const seconds = Math.round(ms / 1000);
  const res = await storage.get('stats');
  const stats = res.stats || { daily: {}, streak: 0, lastFocusDate: null };

  const today = localDateKey();
  const day = stats.daily[today] || { focusSeconds: 0, pomodoros: 0 };
  day.focusSeconds += seconds;
  day.pomodoros += 1;
  stats.daily[today] = day;

  const yesterday = localDateKey(new Date(Date.now() - 86400000));
  if (stats.lastFocusDate === today) {
    // 今天已经专注过，连续天数不变
  } else if (stats.lastFocusDate === yesterday) {
    stats.streak += 1;   // 昨天也专注过，连续 +1
  } else {
    stats.streak = 1;    // 中断或首次，重新从 1 开始
  }
  stats.lastFocusDate = today;

  await storage.set({ stats });
}

// ---------------------------------------------------------------------------
// 健康提醒
// ---------------------------------------------------------------------------

/** 根据设置同步三个健康提醒闹钟（开关 + 间隔） */
async function syncReminderAlarms() {
  const s = await getSettings();
  const plan = [
    ['remind-water', s.waterEnabled, s.waterInterval],
    ['remind-sedentary', s.sedentaryEnabled, s.sedentaryInterval],
    ['remind-eye', s.eyeEnabled, s.eyeInterval]
  ];
  for (const [name, enabled, interval] of plan) {
    if (enabled) {
      // periodInMinutes 最小 0.5，且首个触发也在一个周期之后
      chrome.alarms.create(name, { periodInMinutes: Math.max(0.5, interval) });
    } else {
      chrome.alarms.clear(name);
    }
  }
}

/** 处理健康提醒闹钟 */
async function handleReminder(name) {
  const s = await getSettings();
  if (name === 'remind-water' && s.waterEnabled) {
    notify('喝水时间', pick(WATER_MSGS));
  } else if (name === 'remind-sedentary' && s.sedentaryEnabled) {
    notify('该动一动啦', pick(SEDENTARY_MSGS));
  } else if (name === 'remind-eye' && s.eyeEnabled) {
    notify('护眼小提醒', pick(EYE_MSGS));
  }
}

// ---------------------------------------------------------------------------
// 初始化与启动
// ---------------------------------------------------------------------------

/** 首次安装时写入默认数据 */
async function initDefaults() {
  const res = await storage.get(null);
  const patch = {};
  if (!res.settings) patch.settings = DEFAULT_SETTINGS;
  if (!res.blacklist) patch.blacklist = [];
  if (!res.timer) patch.timer = { mode: 'idle', status: 'idle', endsAt: null, remaining: 0, total: 0, cycleCount: 0 };
  if (!res.stats) patch.stats = { daily: {}, streak: 0, lastFocusDate: null };
  if (Object.keys(patch).length) await storage.set(patch);
}

/** 浏览器重启后：若计时已过期则复位，否则重建结束闹钟 */
async function reconcileTimer() {
  const timer = await getTimer();
  if (timer.status === 'running') {
    if (Date.now() >= timer.endsAt) {
      await resetTimer(); // 关闭浏览器期间已到期，直接复位，不再补发通知
    } else {
      chrome.alarms.create('timer-end', { when: timer.endsAt });
      chrome.alarms.create('timer-tick', { periodInMinutes: 1 });
    }
  }
  await updateBadge();
}

chrome.runtime.onInstalled.addListener(async () => {
  await initDefaults();
  await syncReminderAlarms();
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await syncReminderAlarms();
  await reconcileTimer();
});

// ---------------------------------------------------------------------------
// 闹钟分发
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'timer-end') {
    await handleTimerEnd();
  } else if (alarm.name === 'timer-tick') {
    await updateBadge();
  } else {
    await handleReminder(alarm.name);
  }
});

// ---------------------------------------------------------------------------
// 消息中枢：响应 popup / newtab / options 的请求
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg && msg.type) {
      case 'GET_STATE':
        return await getFullState();

      case 'START_FOCUS':
        await startTimer('focus');
        return await getFullState();

      case 'PAUSE':
        await pauseTimer();
        return await getFullState();

      case 'RESUME':
        await resumeTimer();
        return await getFullState();

      case 'RESET':
        await resetTimer();
        return await getFullState();

      case 'SET_SETTINGS':
        await saveSettings(msg.settings);
        return await getFullState();

      case 'TOGGLE_REMINDER':
        await toggleReminder(msg.key, msg.enabled);
        return await getFullState();

      case 'ADD_SITE':
        return await addSite(msg.domain);

      case 'REMOVE_SITE':
        return await removeSite(msg.domain);

      case 'CLEAR_DATA':
        await clearData();
        return { ok: true };

      default:
        return { ok: false, error: '未知的消息类型: ' + (msg && msg.type) };
    }
  })().then(sendResponse).catch((err) => sendResponse({ ok: false, error: String(err) }));

  // 返回 true 表示异步 sendResponse
  return true;
});

// ---------------------------------------------------------------------------
// 设置 / 黑名单 / 数据清除
// ---------------------------------------------------------------------------

/** 保存设置（部分更新 + 合并默认值 + 数值钳制），并重建提醒闹钟 */
async function saveSettings(partial) {
  const cur = await getSettings();
  const next = { ...cur };
  if (partial && typeof partial === 'object') {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (partial[key] !== undefined) next[key] = partial[key];
    }
  }

  next.focusMinutes = clampInt(next.focusMinutes, 1, 180);
  next.shortBreakMinutes = clampInt(next.shortBreakMinutes, 1, 60);
  next.longBreakMinutes = clampInt(next.longBreakMinutes, 1, 120);
  next.longBreakInterval = clampInt(next.longBreakInterval, 1, 12);
  next.waterInterval = clampInt(next.waterInterval, 1, 240);
  next.sedentaryInterval = clampInt(next.sedentaryInterval, 1, 240);
  next.eyeInterval = clampInt(next.eyeInterval, 1, 120);
  next.waterEnabled = !!next.waterEnabled;
  next.sedentaryEnabled = !!next.sedentaryEnabled;
  next.eyeEnabled = !!next.eyeEnabled;

  await storage.set({ settings: next });
  await syncReminderAlarms();
  return next;
}

/** 快速开关单个健康提醒 */
async function toggleReminder(key, enabled) {
  const map = { water: 'waterEnabled', sedentary: 'sedentaryEnabled', eye: 'eyeEnabled' };
  if (!map[key]) return;
  const settings = await getSettings();
  settings[map[key]] = !!enabled;
  await storage.set({ settings });
  await syncReminderAlarms();
}

/** 添加黑名单域名 */
async function addSite(domain) {
  const d = normalizeDomain(domain);
  if (!d) return { ok: false, error: '域名格式不正确，例如：example.com' };
  const res = await storage.get('blacklist');
  const list = res.blacklist || [];
  if (list.includes(d)) return { ok: false, error: '该域名已在黑名单中', blacklist: list };
  list.push(d);
  await storage.set({ blacklist: list });
  return { ok: true, blacklist: list };
}

/** 移除黑名单域名 */
async function removeSite(domain) {
  const res = await storage.get('blacklist');
  const list = (res.blacklist || []).filter((x) => x !== domain);
  await storage.set({ blacklist: list });
  return { ok: true, blacklist: list };
}

/** 清除所有数据并恢复默认 */
async function clearData() {
  await storage.clear();
  chrome.alarms.clear('timer-end');
  chrome.alarms.clear('timer-tick');
  await initDefaults();
  await syncReminderAlarms();
  await updateBadge();
}
