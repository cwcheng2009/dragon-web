# 金龍追珠（食指控制）

火焰龍珠跟著鏡頭裡你的**食指指尖**移動（MediaPipe Hands，偵測第 8 號關鍵點），金龍會一路追著龍珠游動；沒有開鏡頭時改用滑鼠或觸控。

## 在 Mac 上開啟

1. 下載專案：在 GitHub 頁面按「Code」→「Download ZIP」，或 `git clone https://github.com/cwcheng2009/blender-3d-model.git`。
2. 在 Finder 雙擊 `start.command`（第一次若被擋，按右鍵 → 打開）。
   或在終端機執行：
   ```bash
   cd blender-3d-model/Chinese_Dragon/web
   python3 -m http.server 8000
   ```
   再用 Chrome 開 http://localhost:8000
3. 按「開啟鏡頭（食指控制）」，允許使用相機，舉起手用食指指揮龍珠。鏡頭畫面會鋪滿背景，左下角的「背景影像」滑桿可調整透明度（0% 完全隱藏）。

> 鏡頭只能在 `localhost` 或 `https` 網址下使用，直接雙擊 `index.html`（file://）會無法載入模型和鏡頭。

## 音樂與錄影

- **音樂**：按「音樂：關/開」切換（開鏡頭時會自動打開）。全部用瀏覽器即時合成，沒有音檔：龍珠移動越快，古箏般的五聲音階撥弦越密；龍珠在畫面越高，音越高；另有低音持續音、隨速度變大的風聲，突然快速衝刺時會敲一聲鑼。
- **錄影**：按「● 錄影」開始，再按一次停止，影片會自動下載（Chrome 多為 WebM，Safari 為 MP4）。錄進去的是你看到的畫面：鏡頭背景（依滑桿透明度）、金龍、火焰龍珠，加上音樂。

## 檔案

- `index.html`、`dragon.js`、`music.js`：網頁、互動程式與音樂合成（three.js + MediaPipe Tasks Vision，皆從 jsDelivr CDN 載入）
- `dragon.glb`：帶骨架的金龍（36 節脊椎 + 頭、下顎、四肢），由 `../scripts/v3_rig_animate.py glb` 匯出（`GLB_OUT` 指定路徑）

## 運作原理

龍頭追著龍珠旁邊一個繞圈的點游動，並沿路留下軌跡；36 節脊椎骨依序排在軌跡上（每節固定間距），再加一點左右擺動，所以整條龍身會順著龍頭走過的路線流動。下顎開合、四肢划動沿用 Blender 裡做的動畫。Blender 影片版（`../scripts/v3_chase_pearl.py`）用的是同一個方法，只是龍珠改沿著固定的環形路線飛。

## TouchDesigner

同一個 `dragon.glb` 可以用 TouchDesigner 的 **Import Select / FBX COMP** 匯入（需要 FBX 時可在 Blender 另存）。手部追蹤可用社群的 MediaPipe TouchDesigner 外掛，把食指座標當成龍珠位置，再用同樣的「軌跡跟隨」邏輯驅動骨架。
