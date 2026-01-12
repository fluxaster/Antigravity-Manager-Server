# Antigravity-Manager-Server
> 专业的 AI 账号管理与协议反代系统 (v3.3.20)
<div align="center">
  <img src="public/icon.png" alt="Antigravity Logo" width="120" height="120" style="border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.15);">

  <h3>您的个人高性能 AI 调度网关</h3>
  <p>通过 Web 管理界面，您可以轻松管理 AI 账号、配置代理、监控请求，实现 AI 调度的自动化和智能化。</p>
  
  <p>
    <a href="https://github.com/fluxaster/Antigravity-Manager-Server">
      <img src="https://img.shields.io/badge/Version-3.3.20-blue?style=flat-square" alt="Version">
    </a>
    <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
    <img src="https://img.shields.io/badge/Backend-Rust-red?style=flat-square&logo=rust&logoColor=white" alt="Rust">
    <img src="https://img.shields.io/badge/Frontend-React-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React">
    <img src="https://img.shields.io/badge/Build-Vite-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
    <img src="https://img.shields.io/badge/License-CC--BY--NC--SA--4.0-lightgrey?style=flat-square" alt="License">
  </p>
</div>

---

> 基于 [Antigravity-Manager](https://github.com/lbjlaq/Antigravity-Manager) 修改，添加 Web 管理界面与 Docker 一键部署，适用于 VPS 部署的 AI 账号管理与协议反代系统。

## 🚀快速部署

### 1. 使用预构建镜像部署 (推荐)
```bash
docker run -d --name antigravity-server \
  -p 8045:8045 \
  -v antigravity-data:/root/.config/antigravity-tools \
  -e PORT=8045 \
  --restart unless-stopped \
  ghcr.io/fluxaster/antigravity-manager-server:main
```

### 2. 源码构建部署

如果您想从源码构建：

1. 克隆项目
```bash
git clone https://github.com/fluxaster/Antigravity-Manager-Server.git
cd Antigravity-Manager-Server
```

2. 构建并启动
```bash
docker compose up -d --build
```

3. 查看日志
```bash
docker compose logs -f
```

服务将在 `http://<服务器IP>:8045` 上运行。

**环境变量**
| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 8045 | 服务监听端口 |
| `RUST_LOG` | info | 日志级别 |

**数据持久化**：配置和账号数据存储在 Docker 卷 `antigravity-data` 中。


### 3. 账号配置

服务器版本支持多种账号导入方式：

**方式一：Web OAuth 登录 (推荐)**
1. 在 Web 管理界面点击「添加账号」→「OAuth」
2. 点击「获取授权链接」，复制链接在本地浏览器中打开
3. 完成 Google 登录后，浏览器会跳转到「127.0.0.1 拒绝了我们的连接请求」页面（这是正常的）
4. 复制地址栏中的完整 URL，粘贴到输入框，系统会自动解析授权码

**方式二：JSON 文件导入**
1. 从桌面版 Antigravity 导出账号为 JSON 文件
2. 在 Web 管理界面点击「添加账号」→「从数据库导入」→「选择 JSON 文件」
3. 系统会自动解析并批量导入账号

> **首次登录**：系统会自动跳转到设置向导，引导您设置 Web 管理密码。

---

## ⚠️ 功能差异

本版本专为服务器环境优化，与桌面完整版存在以下差异：

| 功能模块 | 状态 | 说明 |
|----------|------|------|
| **Web 管理界面** | ✅ 支持 | 提供完整的账号管理、代理配置、实时监控面板 |
| **API 接口** | ✅ 支持 | 完美支持 OpenAI / Claude / Gemini 协议转换与中转 |
| **OAuth 登录** | ✅ 支持 | Web 模式手动复制授权链接完成登录，支持自动解析完整 URL |
| **JSON 导入导出** | ✅ 支持 | 通过浏览器上传/下载 JSON 文件进行账号批量管理 |
| **VSCode DB 导入** | ❌ 移除 | 需要访问本地文件系统，请使用 JSON 导入替代 |
| **GUI 窗口** | ❌ 移除 | 无需 X11/Wayland 桌面环境，纯命令行启动 |
| **开机自启动** | ❌ 不适用 | 服务器模式始终运行，通过 Docker 管理生命周期 |
| **Antigravity 联动** | ❌ 不适用 | 服务器环境无法与本地 IDE 插件联动 |

---

## 📜 许可证

本项目基于 [Antigravity Tools](https://github.com/fluxaster/Antigravity-Manager) 修改，遵循原项目的 **CC-BY-NC-SA-4.0** 许可证。
仅供个人学习研究使用，严禁用于商业用途。

<div align="center">
  <p>Copyright © 2026 Antigravity Team.</p>
</div>
