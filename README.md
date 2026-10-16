# 专注星球 FocusPlanet

一个 Chrome 浏览器扩展：学习专注助手，集番茄钟、网站黑名单、健康提醒、学习统计、新标签页仪表盘与弹窗控制于一体。

深蓝 + 青色渐变的星空视觉，让专注这件事变得更有仪式感。

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 番茄钟 | 25 分钟专注 / 5 分钟短休息 / 15 分钟长休息，支持自定义、开始 / 暂停 / 重置，专注结束发系统通知，专注期间图标显示剩余分钟角标 |
| 网站黑名单 | 专注进行中访问黑名单域名时显示「专注中」全屏提示页，非专注期间不拦截 |
| 健康提醒 | 喝水（默认 30 分钟）、久坐（默认 60 分钟）、护眼（20-20-20，默认 20 分钟），均可开关 / 调间隔，文案温和有趣 |
| 学习统计 | 今日专注时长、完成番茄数、本周每日趋势、连续专注天数 |
| 新标签页仪表盘 | 替换默认新标签页，显示时钟、今日数据、本周趋势、快捷开始、提醒状态 |
| 弹窗 | 快捷开始 / 暂停番茄钟、查看今日统计、快速开关提醒、打开设置 |

## 目录结构

```
focus-planet/
├── manifest.json          # Manifest V3 清单
├── background.js          # Service Worker：番茄钟 / 提醒 / 统计 / 消息中枢
├── content.js             # 黑名单页面拦截（注入遮罩）
├── content.css            # 遮罩样式
├── popup.html / popup.css / popup.js   # 弹窗
├── newtab.html / newtab.css / newtab.js # 新标签页仪表盘
├── options.html / options.css / options.js # 设置页
├── icons/                 # 16/48/128 PNG + icon.svg
├── tools/gen-icons.ps1    # 图标生成脚本（可选）
└── README.md
```

## 安装步骤

1. 打开 Chrome，地址栏输入 `chrome://extensions` 并回车。
2. 打开右上角的「开发者模式」开关。
3. 点击左上角「加载已解压的扩展程序」。
4. 选择本项目所在目录（包含 `manifest.json` 的那一层，即 `D:\AITraining\cursor-demo2`）。
5. 加载成功后，浏览器工具栏会出现「专注星球」图标，新标签页也会被替换为专注仪表盘。

> 提示：修改代码后，回到 `chrome://extensions` 点击扩展卡片上的「刷新」按钮重新加载。

## 使用说明

### 番茄钟
- 点击工具栏图标 → 弹窗中点「开始专注」。
- 专注进行中图标角标会显示剩余分钟数。
- 专注结束会弹出系统通知，并自动进入休息阶段；每完成 N 个番茄（默认 4 个）进入一次长休息。
- 暂停 / 继续 / 重置都在弹窗或新标签页中操作。

### 网站黑名单
- 在设置页添加要屏蔽的域名（例如 `example.com` 或 `https://www.example.com`，会自动归一化）。
- 仅当「专注进行中」时访问这些域名才会显示「专注中」提示页；休息或空闲时不受影响。

### 健康提醒
- 在设置页调整喝水 / 久坐的间隔，或开关护眼提醒。
- 弹窗与新标签页可快速开关三类提醒。
- 提醒通过系统通知推送，文案温和不打扰。

### 数据清除
- 设置页底部「清除所有数据」会重置设置、黑名单与统计。

## 图标

- `icons/icon16.png`、`icon48.png`、`icon128.png`：由 `tools/gen-icons.ps1` 自动生成的星球图标。
- `icons/icon.svg`：矢量源文件，可自行替换为高清图标后重新导出 PNG。
- 如需重新生成 PNG，在 PowerShell 中运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\gen-icons.ps1
```

## 技术要点

- **Manifest V3**：后台使用 Service Worker，所有状态持久化到 `chrome.storage.local`，Worker 被回收后计时与统计不丢失。
- **精准计时**：番茄钟结束用 `chrome.alarms.create('timer-end', { when: 绝对时间戳 })` 触发，避免 Service Worker 睡眠导致的计时漂移。
- **角标刷新**：用每分钟一次的 `timer-tick` 闹钟更新 `chrome.action.setBadgeText`。
- **提醒重建**：`chrome.alarms` 在浏览器重启后会丢失，因此在 `onInstalled` / `onStartup` 时重建健康提醒闹钟。
- **黑名单拦截**：`content.js` 监听 `chrome.storage.onChanged`，专注开始 / 结束可即时注入 / 解除遮罩，无需刷新页面。

## 权限说明

- `alarms`：定时提醒与计时结束
- `notifications`：系统通知
- `storage`：保存设置、黑名单、统计
- `tabs` / `activeTab` / `scripting`：标签页相关能力
- `host_permissions: <all_urls>`：让内容脚本能在任意页面读取存储状态以判断是否拦截
