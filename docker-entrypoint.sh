#!/bin/bash
set -e

# Ensure data directory exists
mkdir -p /root/.config/antigravity-tools

# Handle signals for graceful shutdown
trap 'kill -TERM $PID' TERM INT

# Start the server
exec "$@"
