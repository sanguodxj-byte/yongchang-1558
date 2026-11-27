# 代码与原创资产授权范围

本项目当前代码采用 **GNU Affero General Public License v3.0 only (AGPL-3.0-only)**，全文见 [LICENSE](LICENSE)。范围包括 `game/scripts/`、`game/shaders/`、`init.lua`、`scripts/`、迁移对照代码 `src/` 与 `index.html` 的程序逻辑。此前以 MIT 发布的版本保留其已有授权；原 MIT 声明保存在 `licenses/Legacy-MIT.txt`。

团队原创且有权授权的非代码作品采用 **Creative Commons Attribution 4.0 International (CC BY 4.0)**：程序化生成的建筑、人物、船只、植被、场景几何、地图编排（含 `content/yongchang-map.json` 原创布局与 `content/model-library/` 原模型数据）、界面视觉（含 `game/assets/ui/` 原创图标、画像和皮肤）和合成音效，以及由这些内容导出的 `game/assets/geometry.bin.z` 与 `game/assets/world.json` 中的原创表现内容。生成器与着色器本身仍属于 AGPL 代码。

- 许可证链接：https://creativecommons.org/licenses/by/4.0/
- 完整条款：`licenses/CC-BY-4.0.txt`。
- 署名：`守望1558：永昌风云 / sanguodxj-byte 及项目贡献者`。
- 请保留署名及许可证链接，并标明修改。允许商业使用、修改与再分发，不限制 Dora 用途。

第三方程序、字体及其生成的许可通知不在上述原创资产再授权范围内，继续遵循各自许可证，详见 [THIRD_PARTY.md](THIRD_PARTY.md)。`game/assets/font.ttf` 是 Sarasa Gothic，`game/assets/title-kai.ttf` 是未修改的霞鹜文楷 Medium，两者使用 OFL；Godot 和 Three.js 保持 MIT。史料中的事实与引用来源见 `docs/yongchang-map.md`、`docs/raider-island.md`，不对他人文章或照片主张原创授权。本项目没有捆绑这些网页的照片或音视频。

AI 辅助用于代码、程序化模型和移植实现；模型与合成音效由项目代码生成。当前标题背景 `game/assets/ui/title-guohua.png` 于2026-11-26通过本地AIStudio2API调用 `gemini-3-pro-image` 进行两阶段图生图：以项目代码封面为构图参考重绘青绿国画，再修复纸色衔接。2560×1600 PNG原样落盘；山石皴法、墨色远山、松树、工笔屋瓦、城门和帆船细节由模型生成。输入图、阶段图、完整提示词、参数与哈希保存于 `content/cover-reference.png`、`content/cover-guohua-stage1.png`、`content/cover-edit-prompt.txt`、`content/cover-paper-fix-prompt.txt` 与 `content/cover-generation.json`。封面在团队有权授权范围内遵循上述CC BY 4.0条款；标题、印章文字和按钮由游戏单独绘制。未采用的其他生成候选不随正式包交付。赛事AI声明须如实列明封面图生图与其他实际使用记录。
