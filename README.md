# miloco-bot

**miloco-bot** is a TypeScript-based middleware that acts as a **Model Context Protocol (MCP)** server for [Xiaomi Miloco](https://github.com/XiaoMi/xiaomi-miloco). It bridges Miloco with **Telegram**, enabling bi-directional communication: Miloco can send notifications to Telegram, and users can interact with Miloco via Telegram messages.

## Features

- **MCP Server Implementation**: Implements the Model Context Protocol using Streamable HTTP for seamless integration with Miloco.
- **Telegram Integration**:
  - **Send Messages**: Exposes MCP Tools allowing Miloco agents to send messages to specific Telegram chats.
  - **Receive Messages**: Exposes MCP Resources (`telegram://messages/recent`) that store recent messages. Miloco can poll this resource periodically (via its rule engine) to receive new messages.
- **TypeScript**: Built with modern TypeScript for type safety and maintainability.
- **Secure**: Supports Token-based authentication as required by Miloco's MCP configuration.

## Prerequisites
 
 - **Node.js** (v24 or higher)
 - **npm** or **yarn** or **pnpm**
- A **Telegram Bot Token** (obtained from [@BotFather](https://t.me/BotFather))
- A **Telegram Chat ID** (the user or group ID to interact with)

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
    Create a `.env` file in the root directory:
    ```env
    # Server Configuration
    PORT=3000
    MCP_API_KEY=your-secret-token-for-miloco

    # Telegram Configuration
    TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
    TELEGRAM_DEFAULT_CHAT_ID=987654321
    ```

## Usage

1.  **Build and Start the Server**:
    ```bash
    npm run build
    npm start
    ```
    Or for development:
    ```bash
    npm run dev
    ```

2.  **Connect to Miloco**:
    - Open your Miloco dashboard.
    - Navigate to **MCP Services** -> **Add Service**.
    - Select **Streamable HTTP**.
    - Fill in the details:
        - **URL**: `http://<your-mac-ip>:3000/mcp` (Ensure your Mac and Miloco device are on the same network).
        - **Request Header (Token)**: `Authorization: Bearer <your-secret-token-for-miloco>` (Matches `MCP_API_KEY` in `.env`).
    - Click **Add**.

## Deployment on Ubuntu (Single Binary)

To package the application as a single executable for Ubuntu 24.04:

1.  **Build the Linux Binary**:
    ```bash
    npm run build:linux
    ```
    This generates `dist/miloco-bot-linux`.
    *(Note: This uses Node.js Single Executable Applications (SEA) feature to inject the application into a Node.js 24 Linux binary)*.

2.  **Deploy to Server**:
    Copy the binary and the management script to your Ubuntu server:
    - `dist/miloco-bot-linux`
    - `scripts/manage.sh`
    - `.env` (or `.env_template`)

3.  **Install and Run**:
    On the server, run the management script:
    ```bash
    chmod +x manage.sh
    sudo ./manage.sh install
    ```
    *Edit `/opt/miloco-bot/.env` if needed.*

4.  **Manage Service**:
    ```bash
    ./manage.sh start    # Start service
    ./manage.sh stop     # Stop service
    ./manage.sh restart  # Restart service
    ./manage.sh logs     # View logs
    ./manage.sh status   # Check status
    ```

## Development

### Project Structure
- `src/index.ts`: Entry point and MCP server setup.
- `src/telegram/`: Telegram bot logic.
- `src/mcp/`: MCP tools and resources definitions.

### MCP Tools Provided
- `send_telegram_message`:
    - **Description**: Sends a text message to a Telegram user.
    - **Parameters**: `message` (string), `chat_id` (optional string/number).

## License

MIT
