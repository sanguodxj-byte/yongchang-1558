# 林地覆盖修正 · 2026-11-28

用户澄清：“树少的异常，不符合现实地貌”。本轮处理重点是林地覆盖与分布。

原生成器只在14个小椭圆里概率植树，同时排除较陡坡地，导致西部山岭2,112格干地上没有一棵树，整图只有209棵。仅调整树模型尺寸不能修复这种地貌错误。

现在用连续地貌场决定林地：西部山岭和山麓为连续林地，平原为林片与自然空地相间，沿水湿润地带增加柳木与竹丛，岛上避开迎海盐湿岸线。常绿树为主体，秋色变体只占少量；坡地偏松木、阔叶木，临水地偏柳木、竹丛。准确历史森林面积没有测绘证据，本方案是与游戏地形相容的植被设计。

| 区域 | 原树数 | 修正树数 | 修正树冠投影覆盖估计 |
| --- | ---: | ---: | ---: |
| 西部山岭 | 0 | 895 | 64.57% |
| 山麓 | 80 | 586 | 56.01% |
| 村落周边 | 8 | 188 | 18.2% |
| 东部平原 | 92 | 983 | 44.61% |
| 岛屿 | 27 | 297 | 31.41% |

区域有重叠，不能相加作为全图数量。可玩地图共2,938棵资源树；镜头可见外围另有10,826棵背景树，避免树林在地图边界被齐线截断。树冠覆盖来自实际树叶网格在XZ平面的凸包投影，不代表历史统计。

人物、房屋与树模型沿用现有比例，本轮没有通过放大树木冒充覆盖率。树干间距至少0.95格，按可见根部采样落地，陡崖与水中不生树。矿点、五桥、初始建筑、主运输走廊保留空间；未来耕地的林缘不再全部清空成规则边界。森林按24格分块实例化，镜头外批次可剔除。

生成入口仍为 `content/yongchang-map.json`、`scripts/terrain_field.py`、`scripts/build-terrain.py`。`scripts/check-vegetation-cover.py` 检查实际树冠、分区密度、树干间隔、桥头和建筑占地；`scripts/audit-landscape.py` 检查前景及外围树根。共同玩法检查继续验证伐木、生产、过桥与渡海。

密林改变可建设位置；砍伐后可以扩建，旧地图存档需要新开局。性能记录只代表本机测试条件，真实手机性能仍需单独验证。

## 完成验收 · 2026-11-28

本节保留林地修正交付时的验收记录。此后岩石模型与坡面配色已调整，树木数量和位置保持一致；最新包及证据见 [岩石与矿点修正](rock-geology.md)，下列旧 PCK 哈希不用于证明新版运行结果。

该轮 H5 与 Dora 包包含上述林地及两端操作修复。2026-11-28 下午重新核对了源文件、实际 HTTP 返回的 PCK、两端内容包以及运行结果；试玩入口为 `http://127.0.0.1:8767/`。

- 世界数据 SHA-256：`92d67e183c045b1aac617dbfcab412e170db6fc5d5ef2d0e55fb565bb0ccd46d`。
- 两端共用 PCK SHA-256：`480d171b3d1d07aa01fe0aa4d1bfc5ac8b2133e040f9ddc9e8e59834f2756a1b`。
- 353 个游戏源文件与构建收据一致；地形生成输入与输出一致。

| 检查 | 本轮结果 |
| --- | --- |
| 林地覆盖、树干间距、桥头及建筑占地 | 12/12 通过，2,938 棵资源树、10,826 棵外围树 |
| 全图自然地形及物件落地 | 18/18 通过，覆盖 21,504 格 |
| 几何、可建设区域与资源可达性 | 13/13 通过，9 处资源点可达，保留 1,642 格村落营造空间 |
| 初始场景及五座木桥 | 23/23 通过，无额外预置人造设施 |
| 共同玩法 | 110/110 通过，含生产运输、五桥双向通行、渡海和攻寨夹具 |
| 浏览器真实输入 | 村落、山麓、西部林地、东部林地、岛林及全图均运行并截图；部队双向过桥通过 |
| Dora 1.10.2.12 OpenGL | 20/20 通过，含启动、建造扣费、募兵、军令、全图和声音开关 |
| 原生画面与镜头范围 | 21 个分区及 14 个特写/全景，共 35 个视角；120 组镜头范围检查通过 |

逐区复核可见山地林冠连续、平原林片与空地相间、海岸与岛岸留有过渡；五桥和矿点周边保留通路，未发现树林在可玩区边界被齐线截断。画面来自实际地图，未为截图额外添加植被。

浏览器在 1600×1000 下分别预热 2.5 秒、采样 4 秒，采样期间不截图：

| 视角 | 有效帧数 | 帧间隔中位数 | 帧间隔 P95 |
| --- | ---: | ---: | ---: |
| 村落 | 249 | 16.60 ms | 20.22 ms |
| 西部林地 | 248 | 16.65 ms | 19.60 ms |
| 全图 | 224 | 18.50 ms | 22.10 ms |

这是共享机器上的短时样本，不能据此判定全程稳定 60 FPS 或手机性能。共同玩法中的准备军队攻寨检查不等于正常经济通关；物理手机、Dora 移动设备与长期战局平衡仍未验收。

本轮报告、35 个原生视角、浏览器运行截图和前后对照图保存在本地 `.build/vegetation-cover/resumed-20261128/`；历史验收索引随交付存放在 `dist/vegetation-evidence/VEGETATION_VALIDATION.json`，对应证据在 `dist/vegetation-evidence/`。原先 `8776` 的冻结包用于旧记录复现，当前试玩使用 `8767`。

```powershell
python scripts/build-terrain.py --check
python scripts/check-vegetation-cover.py
python scripts/audit-landscape.py
python scripts/check-terrain.py
python scripts/check-initial-scenery.py
python scripts/test-common.py
python scripts/capture-landscape.py --output .build/vegetation-review/views
python scripts/check-vegetation-runtime.py --url http://127.0.0.1:8767/ --output .build/vegetation-review/web
python scripts/check-natural-start-runtime.py --url http://127.0.0.1:8767/ --output .build/vegetation-review/crossings
python scripts/check-dora.py --runtime .build/dora-opengl/Dora.exe --project dist/dora --output .build/vegetation-review/dora
```
