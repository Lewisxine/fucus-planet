/**
 * 专注星球 FocusPlanet · 官方网站脚本
 *
 * 功能：
 *  1. 移动端汉堡菜单开合
 *  2. 导航栏滚动吸顶状态（加阴影）
 *  3. 滚动进入视口淡入上移动画（IntersectionObserver）
 *  4. 导航栏当前区块高亮（IntersectionObserver）
 *  5. 点击锚点链接后自动收起移动端菜单
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // 1. 汉堡菜单
  // ------------------------------------------------------------------
  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');

  function closeMenu() {
    navToggle.classList.remove('is-open');
    navLinks.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
  }

  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('is-open');
    navToggle.classList.toggle('is-open', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  // 点击任意导航链接后收起菜单（移动端）
  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  // ------------------------------------------------------------------
  // 2. 导航栏滚动吸顶状态
  // ------------------------------------------------------------------
  const nav = document.getElementById('nav');
  function onScroll() {
    nav.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ------------------------------------------------------------------
  // 3. 滚动进入视口淡入上移动画
  // ------------------------------------------------------------------
  // 为同一网格内的卡片设置错开的延迟，形成依次出现的节奏感
  const groups = document.querySelectorAll('.problem-grid, .feature-grid');
  groups.forEach((group) => {
    group.querySelectorAll('.reveal').forEach((el, i) => {
      el.style.setProperty('--reveal-delay', `${Math.min(i * 80, 320)}ms`);
    });
  });

  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          // 动画只需触发一次
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    // 兜底：不支持 IntersectionObserver 时直接显示
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  // ------------------------------------------------------------------
  // 4. 导航栏当前区块高亮
  // ------------------------------------------------------------------
  const sections = document.querySelectorAll('section[id]');
  const navMap = {};
  document.querySelectorAll('.nav-link').forEach((link) => {
    const href = link.getAttribute('href');
    if (href && href.startsWith('#')) navMap[href.slice(1)] = link;
  });

  if ('IntersectionObserver' in window && sections.length) {
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));
          if (navMap[id]) navMap[id].classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach((s) => sectionObserver.observe(s));
  }
})();
