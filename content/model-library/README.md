# 原模型素材源

此目录保存迁移时从项目 Three.js 实际模型构造器导出的资源。`scripts/build-terrain.py` 只复用原模型、既有桥、码头、船只及岛寨装配，重新生成地形、林群与地表数据；不把旧世界地形直接作为正式地图。

修改地图请编辑 `content/yongchang-map.json`。需要修复原模型时，修改其 `src/` 构造器，运行 `scripts/migrate-assets.py` 更新此目录，再运行 `scripts/build-terrain.py`。不要直接手改正式 `game/assets/world.json` 或二进制；构建收据会检查生成物是否过期。

模型源和导出模型的授权范围见根目录 `ASSET_LICENSE.md`；第三方字体/运行时不在此目录中重新授权。
