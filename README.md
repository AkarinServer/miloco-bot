# miloco-bot

English | [中文](README_CN.md)

**miloco-bot** is a TypeScript-based middleware that acts as a **Model Context Protocol (MCP)** server for [Xiaomi Miloco](https://github.com/XiaoMi/xiaomi-miloco). It bridges Miloco with **Telegram**, enabling bi-directional communication and remote management capabilities.

## Features

- **MCP Server Implementation**: Implements the Model Context Protocol using Streamable HTTP for seamless integration with Miloco.
- **Telegram Integration**:
  - **Send Messages & Photos**: Exposes MCP Tools allowing Miloco agents to send text messages and photos to Telegram.
  - **Broadcast Capability**: Automatically broadcasts messages to all allowed users if no specific chat ID is provided.
  - **Smart Formatting**: Parses `<reflect>` tags in messages to render them as collapsible blockquotes (using Telegram's HTML format), keeping the chat clean.
- **Rule Management**:
  - **View Rules**: List all Miloco trigger rules via Telegram command or MCP tool.
  - **Control Rules**: Enable or disable specific rules remotely.
- **Secure**:
  - **Access Control**: Restricts access to a whitelist of Telegram User IDs (`TELEGRAM_ALLOWED_USER_IDS`). Unauthorized messages are ignored.
  - **Token Authentication**: Supports Token-based authentication for the MCP server.
- **Single Executable**: Builds into a standalone Linux binary (using Node.js SEA) for easy deployment without external dependencies.

## Prerequisites

- A **Telegram Bot Token** (obtained from [@BotFather](https://t.me/BotFather))
- **Miloco** instance running and accessible.

## Installation (Linux x64)

We provide a single-command installation script that downloads the latest binary release and sets up the systemd service.

**Run the following command as root:**

```bash
wget -O - https://raw.githubusercontent.com/AkarinServer/miloco-bot/main/scripts/install.sh | sudo bash
```

**What this script does:**
1.  Downloads the latest `miloco-bot-linux` binary from GitHub Releases.
2.  Installs it to `/opt/miloco-bot/`.
3.  Sets up a systemd service named `miloco-bot`.
4.  Creates a `.env` configuration file if one doesn't exist.

### Configuration

After installation, you **must** configure the bot:

1.  Edit the configuration file:
    ```bash
    sudo nano /opt/miloco-bot/.env
    ```
2.  Fill in your details (Telegram Token, User IDs, Miloco URL, etc.):
    ```env
    # Telegram Configuration
    TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
    TELEGRAM_ALLOWED_USER_IDS=123456789,987654321 # Comma-separated list of allowed user IDs

    # Miloco Configuration
    MILOCO_WS_URL=wss://localhost:8000/api/chat/ws/query
    MILOCO_ADMIN_USERNAME=admin
    MILOCO_PASSWORD=your_miloco_password
    ```
3.  Start the service:
    ```bash
    sudo systemctl start miloco-bot
    ```

### Manage Service

```bash
sudo systemctl status miloco-bot
sudo systemctl restart miloco-bot
sudo journalctl -u miloco-bot -f  # View logs
```

## Connect to Miloco

1.  Open your Miloco dashboard.
2.  Navigate to **MCP Services** -> **Add Service**.
3.  Select **Streamable HTTP**.
4.  Fill in the details:
    - **URL**: `http://<your-server-ip>:3000/mcp`
    - **Request Header (Token)**: `Authorization: Bearer <your-secret-token>` (if `MCP_API_KEY` is set).
5.  Click **Add**.

## Telegram Commands

- `/start`: Check if the bot is running and you are authorized.
- `/help`: Show available commands.
- `/ping`: Check connection to Miloco.
- `/rules`: View and manage Miloco trigger rules (Interactive UI).
- `/status`: Show system status.

## MCP Tools Provided

The following tools are exposed to Miloco:

- `send_telegram_message`:
    - **Description**: Sends a text message.
    - **Inputs**: `message` (string), `chat_id` (optional).
    - **Behavior**: If `chat_id` is omitted, broadcasts to all `TELEGRAM_ALLOWED_USER_IDS`.

- `send_telegram_photo`:
    - **Description**: Sends a photo.
    - **Inputs**: `photo_path` (string), `caption` (optional), `chat_id` (optional).
    - **Behavior**: Sends a local file. Broadcasts if `chat_id` is omitted.

- `list_rules`:
    - **Description**: Lists all configured rules in Miloco.
    - **Inputs**: `enabled_only` (boolean, default false).

- `toggle_rule`:
    - **Description**: Enables or disables a specific rule.
    - **Inputs**: `rule_id` (string), `enabled` (boolean).

## Development

For contributors who want to build from source:

1.  Clone and install dependencies:
    ```bash
    git clone https://github.com/AkarinServer/miloco-bot.git
    cd miloco-bot
    npm install
    ```
2.  Run in dev mode:
    ```bash
    npm run dev
    ```
3.  Build binary:
    ```bash
    npm run build:linux
    ```

## License

MIT
