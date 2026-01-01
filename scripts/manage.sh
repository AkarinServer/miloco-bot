#!/bin/bash

SERVICE_NAME="miloco-bot"
INSTALL_DIR="/opt/miloco-bot"
BINARY_NAME="node"
SCRIPT_NAME="bundle.cjs"

function show_help {
    echo "Usage: $0 {install|start|stop|restart|status|logs}"
    echo "  install : Install the service to $INSTALL_DIR"
    echo "  start   : Start the service"
    echo "  stop    : Stop the service"
    echo "  restart : Restart the service"
    echo "  status  : Check service status"
    echo "  logs    : View service logs"
}

if [ "$1" == "install" ]; then
    echo "Installing to $INSTALL_DIR..."
    
    # Check if running as root
    if [ "$EUID" -ne 0 ]; then 
      echo "Please run as root (sudo)"
      exit 1
    fi

    # Create directory
    mkdir -p $INSTALL_DIR
    
    # Copy node binary
    if [ -f "temp_build/node" ]; then
        cp "temp_build/node" "$INSTALL_DIR/$BINARY_NAME"
    elif [ -f "node" ]; then
        cp "node" "$INSTALL_DIR/$BINARY_NAME"
    else
        echo "Error: node binary not found in temp_build/ or current directory"
        exit 1
    fi

    # Copy bundle script
    if [ -f "dist/bundle.cjs" ]; then
        cp "dist/bundle.cjs" "$INSTALL_DIR/$SCRIPT_NAME"
    elif [ -f "bundle.cjs" ]; then
        cp "bundle.cjs" "$INSTALL_DIR/$SCRIPT_NAME"
    else
        echo "Error: bundle.cjs not found in dist/ or current directory"
        exit 1
    fi

    # Copy .env if exists, otherwise template
    if [ -f ".env" ]; then
        cp .env "$INSTALL_DIR/"
    elif [ -f ".env_template" ]; then
        cp .env_template "$INSTALL_DIR/.env"
        echo "Created .env from template. Please edit $INSTALL_DIR/.env"
    fi
    
    # Create service file
    cat > /etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=Miloco Bot MCP Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/$BINARY_NAME $INSTALL_DIR/$SCRIPT_NAME
Restart=always
RestartSec=10
EnvironmentFile=$INSTALL_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

    # Set permissions
    chmod +x "$INSTALL_DIR/$BINARY_NAME"
    chmod 600 "$INSTALL_DIR/.env"

    # Reload systemd
    systemctl daemon-reload
    systemctl enable $SERVICE_NAME
    
    echo "Installation complete."
    echo "1. Edit configuration: nano $INSTALL_DIR/.env"
    echo "2. Start service: $0 start"
    exit 0
fi

# Wrapper commands
if [ "$1" == "start" ]; then
    sudo systemctl start $SERVICE_NAME
    echo "Service started."
    exit 0
fi

if [ "$1" == "stop" ]; then
    sudo systemctl stop $SERVICE_NAME
    echo "Service stopped."
    exit 0
fi

if [ "$1" == "restart" ]; then
    sudo systemctl restart $SERVICE_NAME
    echo "Service restarted."
    exit 0
fi

if [ "$1" == "status" ]; then
    sudo systemctl status $SERVICE_NAME
    exit 0
fi

if [ "$1" == "logs" ]; then
    sudo journalctl -u $SERVICE_NAME -f
    exit 0
fi

show_help
