# 第三方组件与授权

| 内容 | 作者/来源 | 许可证及全文 | 使用范围 |
| --- | --- | --- | --- |
| Godot 4.7.2 | Godot Engine contributors, https://github.com/godotengine/godot | MIT, https://godotengine.org/license/ , `licenses/Godot-MIT.txt` | 统一游戏运行时；H5导出包含官方Web运行时，Dora通过其Godot运行库加载项目 |
| Three.js 0.187.0 | Three.js authors, https://github.com/mrdoob/three.js | MIT, https://github.com/mrdoob/three.js/blob/r187/LICENSE , `licenses/Three-MIT.txt` | 旧版H5及一次性程序化资产迁移；正式Dora/H5游戏包不加载Three.js |
| Sarasa Gothic | Belleve Invis et al., https://github.com/be5invis/Sarasa-Gothic | SIL OFL 1.1, https://github.com/be5invis/Sarasa-Gothic/blob/master/LICENSE , `licenses/Sarasa-OFL.txt` | `game/assets/font.ttf`，中文UI字体；字体本身未修改 |
| 霞鹜文楷 Medium | LXGW, https://github.com/lxgw/LxgwWenKai | SIL OFL 1.1, https://github.com/lxgw/LxgwWenKai/blob/main/OFL.txt , `licenses/LXGW-WenKai-OFL.txt` | `game/assets/title-kai.ttf`，标题、按钮与界面题签；取自官方 `fonts/TTF/LXGWWenKai-Medium.ttf`，字节未修改，SHA-256 `f4b8a34d1f838fe411540cb7c97b1c384ac9738a876c4104500bc42508b2312a` |
| Dora SSR 1.10.2 | Li Jin / IppClub, https://github.com/IppClub/Dora-SSR | MIT, https://github.com/IppClub/Dora-SSR/blob/main/LICENSE | 由用户安装的宿主；项目包只带本项目编写的Lua入口，不捆绑Dora二进制 |

Godot Web运行时自带的第三方组件遵循 Godot 官方完整版权清单，见 `licenses/Godot-COPYRIGHT.txt`。赛事提交时同时公开源码、本文及许可证全文；不得把第三方组件改标为本项目原创。

`vendor/` 保留迁移前 Three.js 官方 examples/addons 原文件。内部文件可能包含额外的作者和许可通知，均应保留。正式双平台交付不包含该目录；其用途是复现旧版模型迁移。任何新的外部图片、音频、模型和字体都需要在本表新增来源、作者、许可链接和使用范围后才能纳入发布包。

地形研究引用温州市文旅局资料、《帝国时代 IV》官方内容编辑器文档，以及 OpenTopoData 提供的 SRTM90m 现代高程点查询。`content/geographic-reference.json` 记录少量地理测量值与来源，只用于核对西高东低；实际游戏高程为项目原创的玩法地形，并未导入其他游戏地图、贴图或官方文档图片。资料链接及精度边界见 `docs/terrain-design.md`。
