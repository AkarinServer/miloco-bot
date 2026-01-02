#!/bin/bash

set -e

REPO="AkarinServer/miloco-bot"
INSTALL_DIR="/opt/miloco-bot"
BIN_NAME="miloco-bot-linux"
DOWNLOAD_URL="https://github.com/$REPO/releases/download/latest/$BIN_NAME"
SERVICE_NAME="miloco-bot"

# Check for root
if [ "$EUID" -ne 0 ]; then 
  echo "Please run as root"
  exit 1
fi

echo "Installing miloco-bot to $INSTALL_DIR..."

# Create directory
mkdir -p "$INSTALL_DIR"

# Download binary
echo "Downloading binary from $DOWNLOAD_URL..."
if command -v curl >/dev/null 2>&1; then
    curl -L -o "$INSTALL_DIR/$BIN_NAME" "$DOWNLOAD_URL"
elif command -v wget >/dev/null 2>&1; then
    wget -O "$INSTALL_DIR/$BIN_NAME" "$DOWNLOAD_URL"
else
    echo "Error: Neither curl nor wget found."
    exit 1
fi

chmod +x "$INSTALL_DIR/$BIN_NAME"

# Handle .env
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo "Creating .env from template..."
    # Try to download .env_template if not present (in case of fresh install via script only)
    # Or just write a basic one.
    # Let's try to fetch .env_template from raw github content
    TEMPLATE_URL="https://raw.githubusercontent.com/$REPO/main/.env_template"
    if command -v curl >/dev/null 2>&1; then
        curl -L -o "$INSTALL_DIR/.env" "$TEMPLATE_URL"
    else
        wget -O "$INSTALL_DIR/.env" "$TEMPLATE_URL"
    fi
    
    echo "IMPORTANT: Please edit $INSTALL_DIR/.env with your configuration!"
else
    echo ".env already exists, skipping..."
fi

# Create systemd service
echo "Creating systemd service..."
cat > "/etc/systemd/system/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Miloco Bot MCP Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/$BIN_NAME
Restart=always
EnvironmentFile=$INSTALL_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

# Reload and enable
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

echo "Installation complete!"
echo "1. Edit configuration: nano $INSTALL_DIR/.env"
echo "2. Start service: systemctl start $SERVICE_NAME"
echo "3. View logs: journalctl -u $SERVICE_NAME -f"
