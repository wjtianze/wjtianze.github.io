# 天择网品牌图标

- `source/tianze-mark-imagegen.png`：经 ImageGen 生成并人工筛选的透明母版，保留罗盘、种子、分岔路径与星点意象。
- `tianze-mark.png`：导航栏等网页界面使用的 512×512 透明图标。
- `../pwa/icon-192.png`、`../pwa/icon-512.png`、`../pwa/icon-maskable-512.png`：同一母版生成的 PWA 图标。
- 所有 HTML 标签页、PWA 清单和 Windows 桌面程序均使用这套标志；`scripts/codex/normalize-site-brand.js` 负责统一页面引用，`desktop/make-icon.js` 负责生成任务栏与安装包图标。

重新生成派生尺寸时，从工作区根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\codex\build-brand-assets.ps1 -Source .\dev\assets\img\brand\source\tianze-mark-imagegen.png
```

脚本只做透明裁切、缩放和 PWA 安全区排版，不重新绘制标志。
