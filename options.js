/**
 * FocusPlanet 设置页逻辑
 *
 * 番茄钟时长、健康提醒间隔与开关、黑名单管理、数据清除。
 * 设置通过 SET_SETTINGS 消息保存（后台负责合并默认值、钳制数值并重建提醒闹钟），
 * 黑名单增删通过 ADD_SITE / REMOVE_SITE 消息处理。
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------
  // 数据加载
  // ------------------------------------------------------------------

  async function load() {
    const res = await chrome.storage.local.get(['settings', 'blacklist']);
    const s = res.settings || {};
    const blacklist = res.blacklist || [];

    $('focusMinutes').value = s.focusMinutes || 25;
    $('shortBreakMinutes').value = s.shortBreakMinutes || 5;
    $('longBreakMinutes').value = s.longBreakMinutes || 15;
    $('longBreakInterval').value = s.longBreakInterval || 4;

    $('waterInterval').value = s.waterInterval || 30;
    $('sedentaryInterval').value = s.sedentaryInterval || 60;
    $('waterEnabled').checked = s.waterEnabled !== false;
    $('sedentaryEnabled').checked = s.sedentaryEnabled !== false;
    $('eyeEnabled').checked = s.eyeEnabled !== false;

    renderBlacklist(blacklist);
  }

  function renderBlacklist(list) {
    const ul = $('blacklist');
    ul.innerHTML = '';
    $('blacklist-empty').style.display = list.length ? 'none' : 'block';

    for (const domain of list) {
      const li = document.createElement('li');
      li.innerHTML =
        `<span>${escapeHtml(domain)}</span>` +
        `<button class="remove-btn" data-domain="${escapeHtml(domain)}" title="删除">&#10005;</button>`;
      li.querySelector('.remove-btn').addEventListener('click', () => removeSite(domain));
      ul.appendChild(li);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ------------------------------------------------------------------
  // 交互
  // ------------------------------------------------------------------

  // 保存设置
  $('btn-save').addEventListener('click', async () => {
    const settings = {
      focusMinutes: $('focusMinutes').value,
      shortBreakMinutes: $('shortBreakMinutes').value,
      longBreakMinutes: $('longBreakMinutes').value,
      longBreakInterval: $('longBreakInterval').value,
      waterInterval: $('waterInterval').value,
      sedentaryInterval: $('sedentaryInterval').value,
      waterEnabled: $('waterEnabled').checked,
      sedentaryEnabled: $('sedentaryEnabled').checked,
      eyeEnabled: $('eyeEnabled').checked
    };
    const res = await chrome.runtime.sendMessage({ type: 'SET_SETTINGS', settings });
    showToast(res && res.ok !== false ? '设置已保存' : '保存失败');
  });

  // 添加域名
  $('btn-add').addEventListener('click', addSite);
  $('site-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSite();
  });

  async function addSite() {
    const input = $('site-input');
    const domain = input.value.trim();
    if (!domain) return;
    const res = await chrome.runtime.sendMessage({ type: 'ADD_SITE', domain });
    if (res && res.ok) {
      input.value = '';
      renderBlacklist(res.blacklist);
      showToast('已添加');
    } else {
      showToast((res && res.error) || '添加失败');
    }
  }

  async function removeSite(domain) {
    const res = await chrome.runtime.sendMessage({ type: 'REMOVE_SITE', domain });
    if (res && res.ok) renderBlacklist(res.blacklist);
  }

  // 清除数据
  $('btn-clear').addEventListener('click', async () => {
    if (!confirm('确定要清除所有设置、黑名单与统计数据吗？此操作不可恢复。')) return;
    await chrome.runtime.sendMessage({ type: 'CLEAR_DATA' });
    showToast('已清除，正在恢复默认设置');
    setTimeout(load, 400);
  });

  // 轻提示
  let toastTimer = null;
  function showToast(msg) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  load();
})();
