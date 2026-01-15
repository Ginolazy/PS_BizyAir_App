# PS-BizyAir Plugin / PS-BizyAir

[English](#english) | [中文](#中文)

---

<a name="english"></a>

## English - User Guide

PS-BizyAir is a specialized cloud AI collaboration plugin for Adobe Photoshop. By integrating BizyAir.cn's high-performance cloud node services, it allows you to unleash the full potential of AI generation directly within PS without consuming local GPU resources.

### 🌟 Key Features

- **Cloud Acceleration**: Connects seamlessly with BizyAir.cn's high-performance model clusters. No complex local setup required; enjoy low-latency, high-quality AI generation.
- **Smart Account & App Management**:
  - **Multi-Account Support**: Save and switch between multiple API keys to manage different quotas easily.
  - **Out-of-the-Box Experience**: Automatically pre-loads a set of high-quality default apps on first installation (configured via `public_apps.json`).
  - **Auto Private App Sync**: Automatically retrieves all your private workflows (Private Apps) upon login.
  - **Community App Discovery**: Add public workflows via App ID, or manually append default apps from settings. (https://bizyair.cn/community?path=app)
- **Enhanced Canvas Interaction**:
  - **Real-time Sync**: Automatically responds to layer visibility, selection, movement, and transformations within Photoshop.
  - **Preview Lock**: Added a "Lock" button to LoadImage nodes, allowing you to freeze previews and manage multiple reference images independently.
  - Import generation results back to layers or document masks with one click, fitting perfectly into your professional retouching workflow.
- **Minimalist & Refined UI**: Consistent, high-quality icons and a streamlined parameter panel optimized for Photoshop users.

### 🛠️ Installation

1. **Download**: Obtain the plugin source folder.
2. **Copy to Plug-ins**:
   - **macOS**: Copy the folder to `/Applications/Adobe Photoshop 2025/Plug-ins`.
   - **Windows**: Copy the folder to your Photoshop installation's `Plug-ins` directory.
3. **Launch**:
   - Restart Photoshop.
   - Go to `Plugins` -> `PS-BizyAir` to open the control panel.

---

<a name="中文"></a>

## 中文 - 使用说明

PS-BizyAir 是一款专为 Adobe Photoshop 打造的云端 AI 协同插件。通过集成 BizyAir.cn 的高性能云端节点服务，它让您能够在不消耗本地 GPU 资源的前提下，直接在 PS 画布上释放 AI 生成的无限潜力。

### 🌟 核心功能

- **BizyAir 云端加速**：
  - 完美对接 BizyAir.cn 高性能模型群，免去本地环境配置的烦恼，实现低延迟、高画质的 AI 运算。
- **智能账号与 App 管理**：
  - **多账号支持**：支持保存与一键切换多个 API 账号，轻松管理不同配额。
  - **开箱即用体验**：首次安装时自动预载一组高质量默认 App，无需配置即可上手。
  - **私人 App 自动同步**：登录后自动获取您的所有私有Apps（Private Apps），同步个人资产。
  - **社区 App 扩展**：支持输入 App ID 扩展，或在设置中随时手动追加预设默认 App。(https://bizyair.cn/community?path=app)
- **深度画布联动**：
  - **实时同步**：自动感应 Photoshop 内部的图层显隐、切换、移动及变形操作，实现无缝预览。
  - **预览锁定**：LoadImage 节点支持“锁定”功能，您可以冻结特定节点的图像内容，方便多节点协同工作。
  - 支持将 PS 选区或活动图层实时转换为 AI 工作流输入，并将生成结果一键置入图层。
- **精致操作界面**：
  - 全新优化的矢量图标系统与简洁参数面板，让 AI 调优变得直观、优雅。

### 🛠️ 安装方式

1. **下载项目**：获取本项目的所有源代码文件夹（建议文件夹命名为 `PS-BizyAir`）。
2. **复制插件**：
   - **macOS**: 将插件文件夹复制到 `/Applications/Adobe Photoshop 2025/Plug-ins` 目录下。
   - **Windows**: 将插件文件夹复制到 Photoshop 安装目录下的 `Plug-ins` 文件夹中。
3. **启用插件**：
   - 重新启动 Photoshop。
   - 在菜单栏选择 `增效工具 (Plugins)` -> `PS-BizyAir` 即可打开控制面板。

---

*PS-BizyAir: Empowering designers with cloud intelligence. / 让云端算力赋能每一位设计师。*
