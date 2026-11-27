# 守望1558：永昌风云

国风低模海防筑城策略游戏。以永昌堡与英桥王氏的历史为创作背景，从四户村落出发，经营生产运输、筑城募勇、抵御海上来寇，并乘舟反攻岛寨。历史地理参照与玩法创作范围见 [地图说明](docs/yongchang-map.md) 和 [岛寨说明](docs/raider-island.md)。

## Dora 与 H5 同步版本

正式版本只维护 **一份 Godot 4.7.2 工程 `game/`**。地图、模型、玩法、数值、UI、声音均在该工程内。H5 用 Godot Web 运行时，Dora 用 GodotNode 加载同一个 `game.pck`；构建时逐字节核对两个内容包，并在 `BUILD.json` 中记录 SHA-256。

- **Dora**：在 Go 模式的“导入作品包”选择 `dist/Yongchang1558-Dora.zip`，或解压后在 IDE 运行 `init.lua`。需要含 Godot 支持、渲染后端匹配的 Dora SSR 1.10.2。此次实测为官方 OpenGL 版 1.10.2.12；另附字节相同的 `.dora` 扩展名副本。
- **H5**：完整解压 `dist/Yongchang1558-H5.zip`，以 HTTP/HTTPS 提供全部文件，打开 `index.html`。需要 WebGL 2；无需 CDN、Node 服务或跨源隔离头。
- **源码**：`dist/Yongchang1558-Source.zip`；两个运行包内部也各有一份 `SOURCE.zip`。游戏的“开源与授权”界面提供获取入口。

本地启动已构建的 H5：

```powershell
python scripts/serve.py --port 8767
# http://127.0.0.1:8767/
```

源码开发直接使用 Godot 4.7.2 打开 `game/project.godot`。生成两个平台应用包：

```powershell
python scripts/build-platforms.py --godot <Godot-4.7.2-console> --web-template <web_nothreads_release.zip>
```

详见 [运行与构建说明](docs/platforms.md)、[同源约束](docs/platform-contract.md) 和 [验收记录及限制](docs/platform-validation.md)。本地的 `.build/` 与 `dist/` 不入库。

## 山海地图

地图按“西部山脊—山麓林地—双渠村落与耕地—滨海湿地—虚构海岛”重建，参考《帝国时代 IV》先定地块/通路再雕刻和分层绘制的地图制作方法。史实确认、现代地形关系校验与玩法推定见 [地形设计](docs/terrain-design.md)。精确明代岸线未获测绘支持，不作为复原结论。

修改 `content/yongchang-map.json` 后运行 `python scripts/build-terrain.py`（Python 3.11+、NumPy、Pillow）；随后运行共同逻辑和几何检查，再构建两端。生成器保留既有建筑/人物模型，并复用一份地形高度用于渲染、行走、建造和地面拾取。生成器与素材源均包含在源码包中。

```powershell
python scripts/build-terrain.py
python scripts/test-common.py
python scripts/check-terrain.py
python scripts/build-platforms.py
python scripts/check-terrain-runtime.py --runtime <Dora.exe> --output .build/terrain-runtime
```

## 远海反攻

当前地图为 224×96，敌岛东移64格，渡口间距由7格增至71格。双重寨门、四座铳楼、两处岸防炮和5000耐久本营构成后期目标。自动进攻先在大陆渡口集结，再乘船出发；建议用包铁冲车、虎蹲炮车配合护卫。详细数值和验收见 [远海岛寨设计](docs/offshore-fortress.md)。

## 民丁与运输设施

民丁按工种持镰、斧、镐、勺、锯或锤，采集、加工分别使用对应工具。行走按位移落脚，工作包含蓄力、接触和收回，搬运物随双手移动；详见 [动作精修](docs/motion-polish.md)。“水乡民生”可建设2×2物资堆放场及独立绑牛桩；工人选择可达的最近堆场。采石场可独立工作，7格内配绑牛桩后每批石料产量+50%，由牛车运送，同一石场不叠加。详见 [工种、运输与模型修正](docs/worksites-and-animation.md)。

## 性能

保留当前画质与动作，减少重复骨骼求解，使用单位空间查询与对象索引。最新四轮原生对照中，125单位交战平均脚本耗时20.03→10.82毫秒；重战场仍未稳定60FPS。原生/H5的帧尾、内存和复现方法见 [性能报告](docs/performance.md)，其中区分压力夹具、真实输入和共享机器负载。

## 界面风格

两端共用“永昌海防图志”国风 Q 版界面：楷书题签、浅绢纸册页、朱印、青绿选中态和木刻线描图标。封面以原代码画作参考，经图生图重绘为青绿国画，标题与按钮由游戏单独绘制。营造与募勇卡牌保留实际模型画像，宗族与军令按需展开，并提供资源与阶段目标定位。详见 [UI 风格与来源](docs/ui-style.md)。

## 操作

开局、生产、防守、渡海、胜负与重开的实际验收，以及手机尺寸等剩余问题，见 [玩法闭环与易用性检查](docs/gameplay-usability.md)。

- 营造：选卡后点击地面；城墙、油壕支持拖线；`R` 或“转向”旋转，“取消”退出。民生卡可用“上一页/下一页”翻看，左侧显示用途与下一步提示。
- 募勇：六类兵种共用资源与人口规则；点击/拖动部队下令，鸟铳小队可驻防城墙或敌台。
- 渡海：在右下“军令”选择“进攻”，令部队向渡口集结并乘舟反攻，也可直接命令部队前往对岸。
- 宗族：点击左上“宗族”进入“驻祠”、三种乡约、“义捐”（每局两次）、“驰援”（每局一次）；开田、筑堡与守夜解锁加成。
- 镜头：右键拖动、`WASD`、滚轮、`Q/E`；`M` 全图；点击小地图定位。
- 触屏：按钮与地面点按、部队拖动、双指平移/缩放。已配置触控输入；真实手机兼容性须单独验收。
- `Esc` 先收起当前面板、取消营造或选择，再暂停。暂停中按`Esc`直接恢复；可保存进度并返回标题，下次继续守望；胜负结算可直接“再守一局”。

## 项目结构与验证

| 路径 | 用途 |
| --- | --- |
| `game/scripts/session.gd` | 两个平台共用的玩法状态机 |
| `game/scripts/unit_rig.gd` | 人物骨骼、工种工具及行走/工作/战斗动作 |
| `game/scripts/main.gd` | 共用画面、镜头、键鼠/触控与只读状态观察 |
| `game/scripts/mobile_ui.gd`、`game/assets/ui/` | 共用国风 Q 版 UI、册页皮肤、原有模型画像与线描图标 |
| `game/scripts/assets.gd`、`game/assets/` | 原程序化模型与地图的无损导出、统一加载 |
| `game/shaders/`、`game/scripts/sound.gd` | 共用材质、水面与合成音效 |
| `init.lua` | Dora 宿主入口，加载同一 Godot 工程/PCK |
| `scripts/build-platforms.py` | H5、Dora、完整源码归档与校验收据 |
| `scripts/test-common.py` | 共同逻辑测试；战斗用测试军队，不代表正常经济通关 |
| `scripts/check-h5.py` | 已导出 H5 的真实输入、触控模拟、实际响应哈希检查 |
| `scripts/check-dora.py` | Dora 宿主加载、桥接输入、实时状态与截图 |
| `src/`、`vendor/`、根目录 `index.html` | 旧 Three.js 版与资产生成器，保留供迁移对照，不作为正式 H5 入口 |
| `scripts/migrate-assets.py` | 从旧版实际构造器导出模型、地图和数据 |

```powershell
python scripts/test-common.py
python scripts/check-worksites.py
python scripts/check-model-clearance.py
python scripts/check-fortress.py
python scripts/check-fortress-runtime.py
python scripts/check-h5.py --output .build/h5-check
python scripts/check-dora.py --runtime <Dora.exe> --output .build/dora-check
python scripts/check-ui-parity.py --runtime <Dora.exe> --output .build/ui-parity
```

H5 检查前先启动静态服务；Dora 检查前启动对应宿主。旧版对照服务使用 `python scripts/serve.py --directory . --port 8766`。完整来源与生成参数保留在源码包内。

## 授权与参赛

当前代码为 [AGPL-3.0-only](LICENSE)。团队原创且有权授权的非代码资产为 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，允许署名后的商业使用、修改及再分发，并须标明修改。范围与署名见 [ASSET_LICENSE.md](ASSET_LICENSE.md)。第三方字体、Godot、Three.js 保持原许可证，见 [THIRD_PARTY.md](THIRD_PARTY.md)。此前 MIT 版本的既有授权保留。

本地包不等同于完成大赛提交：仍需公开最终完整源码与试玩入口、补齐团队 AI/素材声明、获得原子派社区至少 20 赞、完成互评，并通过组委会运行、质量及授权审核。当前修改尚未推送或发布。
