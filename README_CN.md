# miloco-bot

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

- **Node.js** (构建建议 v24 或更高版本)
- **npm** 或 **yarn** 或 **pnpm**
- **Telegram Bot Token** (通过 [@BotFather](https://t.me/BotFather) 获取)
- 已运行且可访问的 **Miloco** 实例。

## 安装步骤

1.  **克隆仓库**:
    ```bash
    git clone https://github.com/your-username/miloco-bot.git
    cd miloco-bot
    ```

2.  **安装依赖**:
    ```bash
    npm install
    ```

3.  **配置环境**:
    在项目根目录创建一个 `.env` 文件（参考 `.env_template`）：
    ```env
    # Telegram 配置
    TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
    TELEGRAM_ALLOWED_USER_IDS=123456789,987654321 # 允许访问的用户ID列表，用逗号分隔

    # Miloco 配置
    MILOCO_WS_URL=wss://localhost:8000/api/chat/ws/query
    MILOCO_ADMIN_USERNAME=admin
    MILOCO_PASSWORD=your_miloco_password
    # MILOCO_DATA_DIR=/path/to/miloco/data # 可选，用于图片访问

    # 服务器配置
    PORT=3000
    # MCP_API_KEY=your-secret-token # 可选，用于保护 MCP 服务端接口
    ```

## 使用方法

### 开发模式
```bash
npm run dev
```

### 连接到 Miloco
1.  打开你的 Miloco 控制面板。
2.  导航至 **MCP 服务 (MCP Services)** -> **添加服务 (Add Service)**。
3.  选择 **Streamable HTTP**。
4.  填写详细信息：
    - **URL**: `http://<你的IP>:3000/mcp`
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

## Ubuntu 部署 (单体程序)

将程序打包为 Linux (如 Ubuntu) 下的单体可执行文件：

1.  **构建 Linux 二进制文件**:
    ```bash
    npm run build:linux
    ```
    - 该命令会自动下载 Node.js 24 二进制文件（缓存在 `.cache/` 中），生成 Blob 并注入，最终在 `dist/` 目录下生成 `miloco-bot-linux`。

2.  **上传至服务器**:
    将以下文件复制到你的服务器 (例如 `/opt/miloco-bot/`):
    - `dist/miloco-bot-linux`
    - `scripts/manage.sh`
    - `.env`

3.  **安装并运行**:
    在服务器上运行：
    ```bash
    chmod +x manage.sh
    sudo ./manage.sh install
    ```

4.  **服务管理**:
    ```bash
    sudo ./manage.sh start    # 启动服务
    sudo ./manage.sh stop     # 停止服务
    sudo ./manage.sh restart  # 重启服务
    sudo ./manage.sh logs     # 查看日志
    ```

## 项目结构

- `src/index.ts`: 程序入口、MCP 服务器、Telegram 机器人逻辑及 MCP 工具定义。
- `src/miloco_client.ts`: 用于与 Miloco API 交互的客户端（登录、规则管理等）。
- `scripts/`: 构建和管理脚本。

## 许可证

MIT
