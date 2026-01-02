# miloco-bot

[English](README.md) | 中文

**miloco-bot** 是一个基于 TypeScript 开发的中间件程序，它作为 [Xiaomi Miloco](https://github.com/XiaoMi/xiaomi-miloco) 的 **Model Context Protocol (MCP)** 服务端。它在 Miloco 和 **Telegram** 之间架起了一座桥梁，实现了双向通信和远程管理能力。

## 功能特性

- **MCP 服务端实现**：基于 Streamable HTTP 实现了 Model Context Protocol，可与 Miloco 无缝集成。
- **Telegram 集成**：
  - **发送消息与图片**：提供 MCP 工具 (Tools)，允许 Miloco 智能体向 Telegram 发送文本和图片。
  - **广播功能**：如果未指定具体的 `chat_id`，消息会自动广播给所有允许的用户。
  - **智能格式化**：自动解析消息中的 `<reflect>` 标签，将其渲染为可折叠的引用块（使用 Telegram HTML 格式），保持聊天界面整洁。
- **规则管理**：
  - **查看规则**：通过 Telegram 命令或 MCP 工具查看 Miloco 的所有触发规则。
  - **控制规则**：远程开启或关闭特定的规则。
- **安全机制**：
  - **访问控制**：仅允许白名单内的 Telegram 用户 ID (`TELEGRAM_ALLOWED_USER_IDS`) 访问。未授权消息会被直接忽略。
  - **Token 认证**：支持 MCP 服务端的 Token 认证。
- **单体可执行**：通过 Node.js SEA (Single Executable Applications) 构建为独立的 Linux 二进制文件，部署无需额外依赖。

## 前置要求

- **Telegram Bot Token** (通过 [@BotFather](https://t.me/BotFather) 获取)
- 已运行且可访问的 **Miloco** 实例。

## 安装步骤 (Linux x64)

我们提供了一个单行命令安装脚本，用于下载最新的二进制版本并配置 systemd 服务。

**请使用 root 权限运行以下命令：**

```bash
wget -O - https://raw.githubusercontent.com/AkarinServer/miloco-bot/main/scripts/install.sh | sudo bash
```

**脚本执行内容：**
1.  从 GitHub Releases 下载最新的 `miloco-bot-linux` 二进制文件。
2.  安装到 `/opt/miloco-bot/` 目录。
3.  创建一个名为 `miloco-bot` 的 systemd 服务。
4.  如果不存在，则创建一个初始的 `.env` 配置文件。

### 配置

安装完成后，你**必须**配置机器人：

1.  编辑配置文件：
    ```bash
    sudo nano /opt/miloco-bot/.env
    ```
2.  填写你的详细信息（Telegram Token, 用户 ID, Miloco URL 等）：
    ```env
    # Telegram 配置
    TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
    TELEGRAM_ALLOWED_USER_IDS=123456789,987654321 # 允许访问的用户ID列表，用逗号分隔

    # Miloco 配置
    MILOCO_WS_URL=wss://localhost:8000/api/chat/ws/query
    MILOCO_ADMIN_USERNAME=admin
    MILOCO_PASSWORD=your_miloco_password
    ```
3.  启动服务：
    ```bash
    sudo systemctl start miloco-bot
    ```

### 服务管理

```bash
sudo systemctl status miloco-bot
sudo systemctl restart miloco-bot
sudo journalctl -u miloco-bot -f  # 查看日志
```

## 连接到 Miloco

1.  打开你的 Miloco 控制面板。
2.  导航至 **MCP 服务 (MCP Services)** -> **添加服务 (Add Service)**。
3.  选择 **Streamable HTTP**。
4.  填写详细信息：
    - **URL**: `http://<你的服务器IP>:3000/mcp`
    - **请求头 (Token)**: `Authorization: Bearer <your-secret-token>` (如果设置了 `MCP_API_KEY`)。
5.  点击 **添加 (Add)**。

## Telegram 命令

- `/start`: 检查机器人运行状态及权限。
- `/help`: 显示可用命令。
- `/ping`: 检查与 Miloco 的连接状态。
- `/rules`: 查看并管理 Miloco 触发规则（交互式 UI）。
- `/status`: 显示系统状态信息。

## 提供的 MCP 工具

以下工具已暴露给 Miloco：

- `send_telegram_message`:
    - **描述**: 发送文本消息。
    - **输入**: `message` (字符串), `chat_id` (可选)。
    - **行为**: 如果省略 `chat_id`，将广播给所有允许的用户。

- `send_telegram_photo`:
    - **描述**: 发送图片。
    - **输入**: `photo_path` (字符串), `caption` (可选), `chat_id` (可选)。
    - **行为**: 发送本地文件。如果省略 `chat_id`，将广播给所有允许的用户。

- `list_rules`:
    - **描述**: 列出 Miloco 中配置的所有规则。
    - **输入**: `enabled_only` (布尔值, 默认 false)。

- `toggle_rule`:
    - **描述**: 开启或关闭指定规则。
    - **输入**: `rule_id` (字符串), `enabled` (布尔值)。

## 开发指南

如果你是开发者并希望从源码构建：

1.  克隆并安装依赖：
    ```bash
    git clone https://github.com/AkarinServer/miloco-bot.git
    cd miloco-bot
    npm install
    ```
2.  运行开发模式：
    ```bash
    npm run dev
    ```
3.  构建二进制文件：
    ```bash
    npm run build:linux
    ```

## 许可证

MIT
