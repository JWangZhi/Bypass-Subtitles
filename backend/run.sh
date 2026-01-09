#!/bin/bash
# Run script for Bypass Subtitles Backend
# Sets up CUDA library paths for WSL2

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Set CUDA library paths from pip packages
NVIDIA_LIBS="$SCRIPT_DIR/.venv/lib/python3.12/site-packages/nvidia"

# Export library paths
export LD_LIBRARY_PATH="$NVIDIA_LIBS/cublas/lib:$NVIDIA_LIBS/cudnn/lib:$LD_LIBRARY_PATH"

# Run the server
cd "$SCRIPT_DIR"
uv run python main.py "$@"
