# 金龍追珠（食指控制）

龍珠跟著鏡頭裡你的**食指指尖**移動（MediaPipe Hands，偵測第 8 號關鍵點），金龍會一路追著龍珠游動；沒有開鏡頭時改用滑鼠或觸控。

## 在 Mac 上開啟

1. 下載專案：在 GitHub 頁面按「Code」→「Download ZIP」，或 `git clone https://github.com/cwcheng2009/blender-3d-model.git`。
2. 在 Finder 雙擊 `start.command`（第一次若被擋，按右鍵 → 打開）。
   或在終端機執行：
   ```bash
   cd blender-3d-model/Chinese_Dragon/web
   python3 -m http.server 8000
   ```
   再用 Chrome 開 http://localhost:8000
3. 按「開啟鏡頭（食指控制）」，允許使用相機，舉起手用食指指揮龍珠。

> 鏡頭只能在 `localhost` 或 `https` 網址下使用，直接雙擊 `index.html`（file://）會無法載入模型和鏡頭。

## 檔案

- `index.html`、`dragon.js`：網頁與互動程式（three.js + MediaPipe Tasks Vision，皆從 jsDelivr CDN 載入）
- `dragon.glb`：帶骨架的金龍（36 節脊椎 + 頭、下顎、四肢），由 `../scripts/v3_rig_animate.py glb` 匯出（`GLB_OUT` 指定路徑）

## 運作原理

龍頭追著龍珠旁邊一個繞圈的點游動，並沿路留下軌跡；36 節脊椎骨依序排在軌跡上（每節固定間距），再加一點左右擺動，所以整條龍身會順著龍頭走過的路線流動。下顎開合、四肢划動沿用 Blender 裡做的動畫。Blender 影片版（`../scripts/v3_chase_pearl.py`）用的是同一個方法，只是龍珠改沿著固定的環形路線飛。

## TouchDesigner

同一個 `dragon.glb` 可以用 TouchDesigner 的 **Import Select / FBX COMP** 匯入（需要 FBX 時可在 Blender 另存）。手部追蹤可用社群的 MediaPipe TouchDesigner 外掛，把食指座標當成龍珠位置，再用同樣的「軌跡跟隨」邏輯驅動骨架。
