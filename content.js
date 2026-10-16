/**
 * FocusPlanet（专注星球）内容脚本
 *
 * 职责：在「专注进行中」访问黑名单网站时，注入全屏「专注中」遮罩页，
 * 覆盖原网页内容，提醒用户先完成手头的任务。
 *
 * 拦截条件：
 *  1. 番茄钟处于 focus 模式且正在运行（running）
 *  2. 当前页面域名命中黑名单（含子域名后缀匹配）
 *
 * 通过 chrome.storage.onChanged 实时监听，专注开始/结束可即时拦截/解除。
 */
(function () {
  'use strict';

  let overlay = null;

  /** 判断当前域名是否命中黑名单（支持子域名，如 a.b.com 命中 b.com） */
  function isBlockedHost(host, blacklist) {
    if (!host) return false;
    host = host.toLowerCase();
    return blacklist.some((domain) => {
      return host === domain || host.endsWith('.' + domain);
    });
  }

  /** 注入全屏遮罩（样式由 content.css 提供） */
  function showOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'fp-focus-overlay';
    overlay.innerHTML =
      '<div class="fp-overlay-card">' +
      '  <div class="fp-overlay-planet">&#x1FA90;</div>' +
      '  <h1 class="fp-overlay-title">专注中</h1>' +
      '  <p class="fp-overlay-sub">这个网站已加入你的黑名单</p>' +
      '  <p class="fp-overlay-tip">完成当前专注后即可正常访问，先把手头的任务拿下吧</p>' +
      '</div>';
    appendOverlay();
  }

  /**
   * 将遮罩挂载到页面上。
   * 内容脚本在 document_start 运行，此时 documentElement 可能尚未就绪，
   * 因此若根元素不存在则等待 DOMContentLoaded 再挂载。
   */
  function appendOverlay() {
    const host = document.documentElement || document.body;
    if (host) {
      host.appendChild(overlay);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (overlay) (document.documentElement || document.body).appendChild(overlay);
      }, { once: true });
    }
  }

  /** 移除遮罩 */
  function hideOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  /** 读取最新状态并决定是否拦截 */
  function refresh() {
    chrome.storage.local.get(['timer', 'blacklist'], (res) => {
      const timer = res.timer;
      const blacklist = res.blacklist || [];
      const running = timer && timer.mode === 'focus' && timer.status === 'running';
      const blocked = running && isBlockedHost(location.hostname, blacklist);
      if (blocked) showOverlay();
      else hideOverlay();
    });
  }

  // 专注状态或黑名单变化时，实时刷新拦截
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.timer || changes.blacklist)) {
      refresh();
    }
  });

  // 页面加载即检查一次
  refresh();
})();
