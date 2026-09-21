# NonType

<img src="assets/branding/app-icon.png" alt="NonType" width="96" />

**说出想法，让文字跟上你。**

NonType 是基于 Tauri 2、Rust 和 React 的桌面 AI 语音输入工具。当前版本重点验证 Windows：豆包流式语音识别 2.0 → 个人词典与本地纠错 → 豆包 Turbo 整理 → 输入到当前可编辑位置。没有可靠输入目标时，在浮窗中提供文本预览与完整复制。

## 当前功能

- 键盘快捷键与 Windows 鼠标侧键 Mouse 4 / Mouse 5；支持按住说话和按一下开始/再按一下结束。
- 豆包 Streaming ASR，内存 PCM 音频流，无临时音频文件。
- Ark / Doubao 文本整理，默认模型 `doubao-seed-2-1-turbo-260628`，模型与地址可修改。
- 可编辑的个性化整理提示词；推荐提示词保留原意、数字、术语和约束，不回答口述中的问题。
- 手动词典、ASR 热词、用户确认的误听纠正规则。
- 历史保存期限：1天、1周、1月（30天）、1年（365天）、永久；单条、批量与全部删除；分页浏览。
- API 凭据保存在操作系统凭据库；不保存音频。识别和整理仍需把音频/文本发送到你配置的豆包服务。

## 使用

1. 从本仓库 Releases 下载 Windows x64 版本并解压，运行 `nontype.exe`。需要 Microsoft Edge WebView2 Runtime。预览版本未进行商业代码签名。
2. 在“语音设置”填写 **Speech API Key**，选择已开通的流式资源；2.0 小时版为 `volc.seedasr.sauc.duration`。旧控制台也可填写 `App ID:Access Token`。Resource ID 不是实例 ID。
3. 在“豆包文本整理”填写独立的 **Ark API Key**，启用整理。默认 API Base URL：`https://ark.cn-beijing.volces.com/api/v3`。
4. 点击快捷键录制框，按键盘或鼠标侧键；Esc 取消改键。不要让两个同时运行的听写工具绑定同一个侧键。
5. 在“个性化”编辑提示词并保存；下次听写生效。空白提示词使用推荐内容。
6. 在“历史记录”选择保存期限。缩短期限会在确认后删除过期记录；永久不按时间或条数截断。

修改记录后，可以在该条历史的菜单中创建纠正规则。词典热词属于识别提示，不保证每次都命中；这不是自动训练个人声学模型。

## 构建

需要 Node.js 22+、Rust stable、Visual Studio C++ 桌面开发工具、Windows SDK、CMake，以及 WebView2。

```powershell
npm ci
npm run build
npm run lint
npm test
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
npm run tauri -- build --no-bundle
```

也可在 Windows 上使用 `scripts/Build-Windows.ps1 -Release`，它会定位 Visual Studio 工具链。未签名可执行文件位于 `src-tauri/target/release/nontype.exe`。CI 不需要也不会使用真实云服务凭据。

## 数据与兼容性

为兼容早期本地预览版，应用内部标识与凭据库命名暂时保留 `local.opentypeless.mvp` / `OpenTypelessMvp`；升级改名不会丢失现有配置、词典或历史。不要公开上传应用数据目录、SQLite 文件或 `.env.local`。

历史在读取、写入以及应用保留期限时清理；应用运行时也每分钟检查一次。关闭应用期间不会运行，重启后首次读取会清理。SQL 删除不是磁盘取证意义上的安全擦除。

当前 Windows 是实测平台。macOS/Linux 上游代码仍存在，但本项目新增的侧键与输入目标检测未在这些平台验收；没有可靠检测时使用复制回退。100次连续听写、所有目标应用兼容性与长期运行仍在完善。`docs/UPSTREAM.md` 说明上游来源。

## License / 致谢

MIT。NonType 派生自 [tover0314-w/opentypeless](https://github.com/tover0314-w/opentypeless)，保留原作者版权与许可。豆包协议参考过 [aibox22/opentypeless](https://github.com/aibox22/opentypeless) 及用户提供的火山引擎文档。

NonType 是独立项目，不是 Typeless、Wispr Flow 或原 OpenTypeless 云服务的官方客户端。仓库中保留的历史设计文档、多语言 README 和未启用模块属于上游资料，不代表 NonType 当前承诺的功能。
