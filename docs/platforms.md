# Dora 与 H5 同源运行

两端使用 `game/` 下的同一份 Godot 4.7.2 工程。Dora 包的 `game.pck` 与 H5 包的 `game.pck` 必须逐字节相同，校验值写在两端 `BUILD.json`。平台层只负责窗口、输入、音频设备和加载；游戏逻辑、模型、地图、界面、声音和参数均来自同一个PCK。

两端均以 1600×1000 的固定画布居中等比显示，窗口比例不同时留边，界面和地图取景保持一致。浏览器点击、触屏坐标根据实际画布尺寸映射；不把宿主窗口尺寸直接当成游戏逻辑坐标。

## 开发

使用 Godot 4.7.2 打开 `game/project.godot`。GDScript、GL Compatibility渲染，无C#/Mono或GDExtension依赖。既有 `src/`、`vendor/` 和根目录 `index.html` 保留为迁移对照；它们不是正式H5发布入口。

## Dora

需要包含 Godot 运行库、渲染后端匹配的 Dora SSR 1.10.2。此次实测使用官方 OpenGL 便携版 1.10.2.12。在 Go 模式“本地 → 新增 → 导入作品包”选择 `Yongchang1558-Dora.zip`，或解压后在 IDE 运行 `init.lua`。另提供字节相同的 `.dora` 副本。也可在 Dora 工作区打开项目根目录并运行入口；开发时入口加载 `game/`，发布时加载 `game.pck`。只有源码时，请先用 Godot 编辑器导入 `game/` 的字体与图标；发布包已包含导入后的资源。

GodotNode异步就绪后才接受操作；启动失败需读取Dora日志，不能把创建节点成功等同于游戏已运行。

## H5

完整解压 `Yongchang1558-H5.zip`，将全部文件放在同一静态网站目录下，以HTTP/HTTPS打开 `index.html`。不得只上传HTML，必须保留 `game.js`、`game.wasm` 和 `game.pck`。使用WebGL 2浏览器。单线程Web模板不需要COOP/COEP；本包不依赖CDN或Node服务器。

本地测试：在解压目录运行 `python -m http.server 8767 --bind 127.0.0.1`，打开 `http://127.0.0.1:8767/`。移动端建议横屏；真实手机验收状态见 `docs/platform-validation.md`。

## 生成交付包

```
python scripts/build-platforms.py --godot <Godot-4.7.2-console> --web-template <web_nothreads_release.zip>
```

输出：`dist/Yongchang1558-H5.zip`、`dist/Yongchang1558-Dora.zip`（及同内容 `.dora`）、`dist/Yongchang1558-Source.zip` 和解压目录。生成器先构建 H5，再把同一个 PCK 放入 Dora 包，并写入内容哈希。两个应用包内都包含 `SOURCE.zip` 完整对应源码、许可证和本说明。

构建脚本默认路径适合本工作机，其他环境请显式传入 Godot 和模板路径。Python 3.11+ 可运行构建和公共玩法检查；浏览器验证/重新迁移资产另需 `pip install playwright` 与 Chromium/Edge，通过 `--browser` 指定浏览器可执行文件。正式运行无需 Python、Node 或 Playwright。

`python scripts/test-common.py --godot <Godot-4.7.2-console>` 检查共同的玩法状态机。发布前还需H5真实输入和Dora宿主运行验证。

`python scripts/check-ui-parity.py --runtime <Dora.exe> --output <证据目录>` 比较两端 12 个界面的布局及画面，同时覆盖 4 种 H5 窗口/DPI 组合。测试前启动 Dora 宿主与 H5 静态服务。PCK 哈希相同与 UI 实测通过是两项独立要求。

## 参赛剩余外部事项

本地生成交付包不等同于已获奖项资格。团队仍须公开完整仓库、指定最终提交及试玩入口，按官方模板提交AI与素材声明，在截止前获得原子派至少20赞并完成作品互评；质量与授权由组委会审核。本任务不自动发布仓库、不代为点赞或互评。

## 地图生成

`content/yongchang-map.json` 是正式地图唯一布局来源，`content/model-library/` 保留原模型素材。更改地图后运行 `python scripts/build-terrain.py`；依赖 NumPy、Pillow（`pip install numpy pillow`），运行游戏本身不需要这些工具。构建双平台前会核对地形源与生成物哈希，过期即失败，避免两个版本混用旧地形。`scripts/migrate-assets.py` 仅在需要重新导出原模型时更新模型源，之后须重新生成地形。
