# 岩石与矿点修正 · 2026-11-28

用户反馈“岩石太突兀而且不合理”。旧版四处石料点复用同一个浅色双尖石模型，三处铁矿复用带鲜橙色矿块的模型；岩石直接竖在草地上，坡面又使用另一套亮灰色。资源图标的形状、重复度和色差破坏了地貌连续性。

石料和铁矿现在采用七个不同的风化岩露头。每个岩体有完整封闭表面，外围按实际地形三角形嵌入土层，露出部分约 0.41–0.50 格高；外形是低矮的不规则块面，铁矿以局部暗褐色氧化痕迹表示。地面与岩体共用灰褐色基岩配色，缓坡保留土壤和苔色过渡，矿点颜色向上坡延续。没有增加格点石阵、石墙或预置开采设施。

模型完整处于原资源格内。九处资源坐标、采集规则、全部通行/营造单元、桥梁高程和 2,938 棵树的位置保持一致，由旧地图逐项对照验证。石料/铁矿位置仍是玩法设定，没有历史矿藏测绘依据。

## 复查与交付

```powershell
python scripts/build-terrain.py --check
python scripts/check-rock-outcrops.py --baseline .build/rock-repair/before/game/assets/world.json
python scripts/audit-landscape.py --output .build/rock-repair/physics.json
python scripts/check-terrain.py --output .build/rock-repair/terrain.json
python scripts/check-worksites.py --output .build/rock-repair/worksites
python scripts/test-common.py
python scripts/capture-rocks.py --output .build/rock-repair/rocks
python scripts/capture-landscape.py --output .build/rock-repair/final-views
```

岩石检查直接读取生成后的顶点、法线和索引，核对封闭性、绕序、实际地面接触、矿点占地、色彩范围和七处模型的差异；植入翻面、缺面、悬浮和橙色矿块验证检测器。近景、四方向视角、原色/法线调试图及短时旋转动画用于检查形状与衔接，全图另由 21 个分区复核。静帧不作为永不闪烁的证明。

本轮岩石检查 43/43、全图物理 19/19、地形 13/13、林地 12/12、自然开局 23/23、共同玩法 110/110、工种设施 65/65 均通过。H5 菜单/营造/触控模拟和 Dora 原生 20 项检查通过。浏览器实际建设采石场、绑牛桩和堆场后，完成采集与牛车送货，增加 9 单位石料；未向游戏注入资源。全图复核 35 个视角，另有岩石四面、近景、原色/法线图及两段旋转动画。视觉复核由实现代理完成。

采石脚本的堆场落点从已长树的 `(25,42)` 改到现有空地 `(24,44)`，并在点击前检查营造预览是否合法。浏览器可用 `--browser` 指定，避免固定 Edge 版本目录失效：

```powershell
python scripts/check-worksites-runtime.py --url http://127.0.0.1:8767/ --browser "C:\Program Files\Google\Chrome\Application\chrome.exe" --output .build/rock-repair/worksites/final-live
```

验收对应世界数据 SHA-256 为 `5fa57deb9df763d673500ad19a88a17747f611c8f213e2c0e50a86b3042f5b1d`，两端同一 PCK 为 `71d11f84fe338d598e0d724a9cc08c25a8814f726bcfbd3f6d241e5a2f13cfe5`。旧版详细输入/植被收据保存在各自证据目录内；本轮最终收据为 `ROCK_VALIDATION.json`。

当前试玩使用 `http://127.0.0.1:8767/`，地图内容改变后需新开局。最终运行证据和源码/包哈希见交付目录 `ROCK_VALIDATION.json` 与 `rock-evidence/`；旧林地验收留作历史对照，不代表新 PCK 的运行结果。真实手机性能、历史地质还原和长期战局平衡不在本轮验收范围内。
