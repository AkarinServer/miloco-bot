# miloco-bot

**miloco-bot** 是一个基于 TypeScript 开发的中间件程序，它作为 [Xiaomi Miloco](https://github.com/XiaoMi/xiaomi-miloco) 的 **Model Context Protocol (MCP)** 服务端。它在 Miloco 和 **Telegram** 之间架起了一座桥梁，实现了双向通信：Miloco 可以通过它向 Telegram 发送通知，用户也可以通过 Telegram 消息与 Miloco 进行交互。

## 功能特性

- **MCP 服务端实现**：基于 Streamable HTTP 实现了 Model Context Protocol，可与 Miloco 无缝集成。
- **Telegram 集成**：
  - **发送消息**：提供 MCP 工具 (Tools)，允许 Miloco 智能体向指定的 Telegram 聊天发送消息。
  - **接收消息**：提供 MCP 资源 (`telegram://messages/recent`) 存储最近的消息。Miloco 可以通过其规则引擎定期轮询该资源以获取新消息。
- **TypeScript**：使用现代 TypeScript 构建，确保类型安全和可维护性。
- **安全认证**：支持 Token 认证，满足 Miloco 的 MCP 配置要求。

## 前置要求
 
 - **Node.js** (v24 或更高版本)
 - **npm** 或 **yarn** 或 **pnpm**
- **Telegram Bot Token** (通过 [@BotFather](https://t.me/BotFather) 获取)
- **Telegram Chat ID** (你希望交互的用户或群组 ID)

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
    在项目根目录创建一个 `.env` 文件：
    ```env
    # 服务器配置
    PORT=3000
    MCP_API_KEY=your-secret-token-for-miloco

    # Telegram 配置
    TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
    TELEGRAM_DEFAULT_CHAT_ID=987654321
    ```

## 使用方法

1.  **构建并启动服务器**:
    ```bash
    npm run build
    npm start
    ```
    或者使用开发模式：
    ```bash
    npm run dev
    ```

2.  **连接到 Miloco**:
    - 打开你的 Miloco 控制面板。
    - 导航至 **MCP 服务 (MCP Services)** -> **添加服务 (Add Service)**。
    - 选择 **Streamable HTTP**。
    - 填写详细信息：
        - **URL**: `http://<你的Mac-IP>:3000/mcp` (确保你的 Mac 和运行 Miloco 的设备在同一局域网内)。
        - **请求头 (Token)**: `Authorization: Bearer <your-secret-token-for-miloco>` (需与 `.env` 中的 `MCP_API_KEY` 一致)。
    - 点击 **添加 (Add)**。

## Ubuntu 部署 (单体程序)

如需将程序打包为 Ubuntu 24.04 下的单体可执行文件并后台运行：

1.  **构建 Linux 二进制文件**:
    ```bash
    npm run build:linux
    ```
    这将在 `dist/` 目录下生成 `miloco-bot-linux` 文件。
    *（注：这使用了 Node.js 单体可执行应用 (SEA) 功能，将应用程序注入到 Node.js 24 Linux 二进制文件中）*。

2.  **上传至服务器**:
    将以下文件复制到你的 Ubuntu 服务器：
    - `dist/miloco-bot-linux`
    - `scripts/manage.sh`
    - `.env` (或 `.env_template`)

3.  **安装并运行**:
    在服务器上运行管理脚本：
    ```bash
    chmod +x manage.sh
    sudo ./manage.sh install
    ```
    *安装完成后，如有需要请编辑 `/opt/miloco-bot/.env` 文件。*

4.  **服务管理**:
    该脚本封装了 systemd 命令：
    ```bash
    ./manage.sh start    # 启动服务
    ./manage.sh stop     # 停止服务
    ./manage.sh restart  # 重启服务
    ./manage.sh logs     # 查看日志
    ./manage.sh status   # 查看状态
    ```

## 开发指南

### 项目结构
- `src/index.ts`: 程序入口及 MCP 服务器设置。
- `src/telegram/`: Telegram 机器人相关逻辑。
- `src/mcp/`: MCP 工具和资源定义。

### 提供的 MCP 工具
- `send_telegram_message`:
    - **描述**: 发送文本消息给 Telegram 用户。
    - **参数**: `message` (字符串), `chat_id` (可选，字符串/数字)。

## 许可证

MIT
