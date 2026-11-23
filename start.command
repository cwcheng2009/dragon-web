#!/bin/bash
# 金龍追珠：在 Mac 上雙擊這個檔案，會開本機網頁伺服器並打開瀏覽器（鏡頭只能在 localhost 或 https 下使用）
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:8000/") &
python3 -m http.server 8000
