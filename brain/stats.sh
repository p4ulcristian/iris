#!/bin/bash
# Iris system stats for tmux status bar

# Colors (tmux format)
PURPLE="#c9b1d4"
DARK="#1f1a28"
GREEN="#98c379"
YELLOW="#e5c07b"
RED="#e06c75"
CYAN="#56b6c2"

# CPU usage (average across cores)
cpu_usage() {
    top -bn1 | grep "Cpu(s)" | awk '{print int($2)}' 2>/dev/null || echo "?"
}

# GPU stats via nvidia-smi
gpu_stats() {
    local gpu_id=$1
    nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits -i $gpu_id 2>/dev/null
}

# Format GPU output
format_gpu() {
    local gpu_id=$1
    local name=$2
    local stats=$(gpu_stats $gpu_id)

    if [ -n "$stats" ]; then
        local usage=$(echo $stats | cut -d',' -f1 | tr -d ' ')
        local mem_used=$(echo $stats | cut -d',' -f2 | tr -d ' ')
        local mem_total=$(echo $stats | cut -d',' -f3 | tr -d ' ')
        local mem_gb=$(echo "scale=1; $mem_used/1024" | bc)
        echo "${name}:${usage}%/${mem_gb}G"
    else
        echo "${name}:--"
    fi
}

# Main output
CPU=$(cpu_usage)
GPU0=$(format_gpu 0 "3080")
GPU1=$(format_gpu 1 "5060")

echo "CPU:${CPU}% │ ${GPU0} │ ${GPU1}"
