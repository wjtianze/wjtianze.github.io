# 天择 UI 4.0 生成式视觉资产

本目录是天择网与天择 OS 4.0 共用的图片资产源。页面文字、交互语义和可访问性仍由 HTML/CSS/JavaScript 提供，图片仅负责视觉表面与图标形状。

## 三套基础视觉

- `wallpaper-{cold|mid|warm}.webp`：运行时全屏“演化星图”壁纸。
- `button-{cold|mid|warm}.webp`：运行时按钮材质。
- `surface-{cold|mid|warm}.webp`：运行时低对比度面板材质。
- 同名 `.png`：图像生成工具输出的无损源图，保留用于后续再处理。

## 图标材质井

- `icon-well-source.png`：OpenAI 图像生成工具产生的中性深色矿物/星网材质源，项目内留档。
- `icon-well-{cold|mid|warm}.png`：512×512 无损低饱和材质井。
- `icon-well-{cold|mid|warm}.webp`：相同材质的运行时压缩版。

材质井只应用在应用图标的背板层。工具栏、状态栏和文字按钮应只显示 glyph，避免在小尺寸控件中重复出现纹理方块。

## 精确 glyph 图集

- `icon-atlas.png`：原始 1254×1254 AI 生成图集，暂时保留给现有代码使用。
- `icon-atlas-legacy.png`：原始图集的逐字节备份。
- `icon-atlas-key.png`：原图集的绿色键控源图。
- `icon-atlas-glyph-master.png`：重新裁切、羽化和光学居中的 1024×1024 白色透明 master。
- `icon-atlas-{cold|mid|warm}.png`：可直接渲染的 1024×1024 双调色图集；白色为主层，主题色为渐变和边缘强调层，不需要 CSS `filter` 或 `mask`。

新图集严格为 8×8，每格 128×128。每个 glyph 从旧图集按 alpha 自动裁切，最长边目标为 98px，使用 0.45px 轻羽化，并按 alpha 重心重新居中。最终直接着色图集的有效最长边为单元格的 76.56%–77.34%。

验收结果：

- 64 格均非空。
- 所有有效 alpha 都留在各自 128px 单元内。
- 外侧 2px 边界没有有效 alpha。
- master 重心偏差为 X `-0.39%..0.39%`、Y `-0.37%..0.38%`。
- 三套直接着色图集重心偏差为 X `-0.21%..0.93%`、Y `-0.19%..0.79%`。

## 建议 CSS

现有 CSS/JavaScript 尚未在本次纯资产任务中改写。接入时应按配色同时切换 atlas 和材质井，并移除旧图集的滤色：

```css
:root,
[data-palette="cold"] {
  --tz-icon-atlas: url("../img/ui-v4/icon-atlas-cold.png");
  --tz-icon-well: url("../img/ui-v4/icon-well-cold.webp");
}

[data-palette="mid"] {
  --tz-icon-atlas: url("../img/ui-v4/icon-atlas-mid.png");
  --tz-icon-well: url("../img/ui-v4/icon-well-mid.webp");
}

[data-palette="warm"] {
  --tz-icon-atlas: url("../img/ui-v4/icon-atlas-warm.png");
  --tz-icon-well: url("../img/ui-v4/icon-well-warm.webp");
}

.tz-icon {
  background-image: var(--tz-icon-atlas);
  background-repeat: no-repeat;
  background-size: 800% 800%;
  background-position: var(--tz-icon-x) var(--tz-icon-y);
  filter: none;
}

.app-icon-well {
  background-image: var(--tz-icon-well);
  background-size: cover;
  background-position: center;
}
```

天择 OS 的 CSS 位于更深目录，接入时将示例 URL 前缀改为 `../../../assets/img/ui-v4/`。8×8 坐标顺序没有变化，仍使用 `0%`、`14.285714%`、`28.571429%`、…、`100%`。

详细机器可读路径、颜色、尺寸和网格顺序见 `manifest.json`。

这些视觉源图由 OpenAI 图像生成工具生成；精确图集与运行时压缩版于 2026-07-31 在本地确定性派生。
