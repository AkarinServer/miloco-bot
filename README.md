# miloco-bot

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

- **Node.js** (v24 or higher recommended for building)
- **npm** or **yarn** or **pnpm**
- A **Telegram Bot Token** (obtained from [@BotFather](https://t.me/BotFather))
- **Miloco** instance running and accessible.

## Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-username/miloco-bot.git
    cd miloco-bot
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configuration**:
    Create a `.env` file in the root directory (see `.env_template`):
    ```env
    # Telegram Configuration
    TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
    TELEGRAM_ALLOWED_USER_IDS=123456789,987654321 # Comma-separated list of allowed user IDs

    # Miloco Configuration
    MILOCO_WS_URL=wss://localhost:8000/api/chat/ws/query
    MILOCO_ADMIN_USERNAME=admin
    MILOCO_PASSWORD=your_miloco_password
    # MILOCO_DATA_DIR=/path/to/miloco/data # Optional, for image access

    # Server Configuration
    PORT=3000
    # MCP_API_KEY=your-secret-token # Optional, for securing the MCP server endpoint
    ```

## Usage

### Development Mode
```bash
npm run dev
```

### Connect to Miloco
1.  Open your Miloco dashboard.
2.  Navigate to **MCP Services** -> **Add Service**.
3.  Select **Streamable HTTP**.
4.  Fill in the details:
    - **URL**: `http://<your-ip>:3000/mcp`
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

## Deployment on Ubuntu (Single Binary)

To package the application as a single executable for Linux (e.g., Ubuntu):

1.  **Build the Linux Binary**:
    ```bash
    npm run build:linux
    ```
    - This downloads the Node.js 24 binary (cached in `.cache/`), generates a blob, and injects it to create `dist/miloco-bot-linux`.

2.  **Deploy to Server**:
    Copy the following to your server (e.g., `/opt/miloco-bot/`):
    - `dist/miloco-bot-linux`
    - `scripts/manage.sh`
    - `.env`

3.  **Install and Run**:
    On the server:
    ```bash
    chmod +x manage.sh
    sudo ./manage.sh install
    ```

4.  **Manage Service**:
    ```bash
    sudo ./manage.sh start    # Start service
    sudo ./manage.sh stop     # Stop service
    sudo ./manage.sh restart  # Restart service
    sudo ./manage.sh logs     # View logs
    ```

## Project Structure

- `src/index.ts`: Main entry point, MCP server, Telegram bot logic, and MCP tool definitions.
- `src/miloco_client.ts`: Client for interacting with Miloco API (Login, Rules, etc.).
- `scripts/`: Build and management scripts.

## License

MIT
