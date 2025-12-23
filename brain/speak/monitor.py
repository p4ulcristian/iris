#!/usr/bin/env python3
"""
Speak Server Monitor - Real-time performance monitoring and stress testing.

Usage:
    python -m brain.speak.monitor             # Live dashboard
    python -m brain.speak.monitor stress      # Stress test (10 requests)
    python -m brain.speak.monitor stress 20   # Stress test (custom count)
    python -m brain.speak.monitor bench       # Benchmark single request
    python -m brain.speak.monitor bench --voice zeus  # Benchmark with voice

Tracks:
- Synthesis latency (time from request to first audio)
- Queue depth
- GPU memory usage
- Watchdog triggers
"""

import argparse
import concurrent.futures
import json
import requests
import statistics
import subprocess
import time
import re
import os
from datetime import datetime
from pathlib import Path

# ANSI colors
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"

LOG_FILE = "/tmp/iris-tts.log"
HOST = "127.0.0.1"
PORT = 8765
BASE_URL = f"http://{HOST}:{PORT}"
QUEUE_STATE_FILE = Path("/tmp/iris/speak-queue")

# Test phrases of varying lengths
TEST_PHRASES = [
    "Hello.",
    "Testing the speech system.",
    "This is a medium length phrase to test synthesis speed.",
    "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.",
    "In ancient mythology, the gods of Olympus watched over mortals from their celestial domain, "
    "intervening in human affairs when destiny demanded their divine presence.",
]


def get_gpu_info():
    """Get GPU memory and utilization."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=index,memory.used,memory.total,utilization.gpu", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=2
        )
        gpus = []
        for line in result.stdout.strip().split("\n"):
            parts = [p.strip() for p in line.split(",")]
            if len(parts) == 4:
                gpus.append({
                    "index": int(parts[0]),
                    "mem_used": int(parts[1]),
                    "mem_total": int(parts[2]),
                    "util": int(parts[3])
                })
        return gpus
    except Exception:
        return []


def get_log_tail(lines=50):
    """Get last N lines of TTS log."""
    try:
        with open(LOG_FILE, 'r') as f:
            all_lines = f.readlines()
            return all_lines[-lines:]
    except Exception:
        return []


def parse_recent_events(log_lines):
    """Parse log for recent performance events."""
    events = []

    # Pattern: timestamp [level] message
    timestamp_re = re.compile(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})')

    for line in log_lines:
        ts_match = timestamp_re.match(line)
        if not ts_match:
            continue

        ts_str = ts_match.group(1)

        if "[QUEUE] Playing:" in line:
            events.append(("play_start", ts_str, line.strip()))
        elif "[QUEUE] Played" in line:
            events.append(("play_done", ts_str, line.strip()))
        elif "[WATCHDOG]" in line:
            events.append(("watchdog", ts_str, line.strip()))
        elif "[SPEAK] Queued" in line:
            events.append(("queued", ts_str, line.strip()))

    return events


def calculate_stats(events):
    """Calculate performance statistics from events."""
    stats = {
        "watchdog_triggers": 0,
        "last_watchdog": None,
        "recent_plays": 0,
        "last_play": None,
    }

    for event_type, ts, msg in events:
        if event_type == "watchdog":
            stats["watchdog_triggers"] += 1
            stats["last_watchdog"] = ts
        elif event_type == "play_done":
            stats["recent_plays"] += 1
            stats["last_play"] = ts

    return stats


def clear_screen():
    """Clear terminal."""
    os.system('clear' if os.name != 'nt' else 'cls')


def print_dashboard(gpus, stats, log_lines):
    """Print monitoring dashboard."""
    clear_screen()

    now = datetime.now().strftime("%H:%M:%S")
    print(f"{BOLD}{CYAN}╔══════════════════════════════════════════════════════════════╗{RESET}")
    print(f"{BOLD}{CYAN}║{RESET}           {BOLD}IRIS SPEAK SERVER MONITOR{RESET}  [{now}]           {BOLD}{CYAN}║{RESET}")
    print(f"{BOLD}{CYAN}╠══════════════════════════════════════════════════════════════╣{RESET}")

    # GPU Status
    print(f"{BOLD}{CYAN}║{RESET} {BOLD}GPU STATUS{RESET}                                                   {BOLD}{CYAN}║{RESET}")
    for gpu in gpus:
        mem_pct = (gpu["mem_used"] / gpu["mem_total"]) * 100
        if mem_pct > 90:
            color = RED
        elif mem_pct > 75:
            color = YELLOW
        else:
            color = GREEN

        bar_width = 30
        filled = int((mem_pct / 100) * bar_width)
        bar = "█" * filled + "░" * (bar_width - filled)

        print(f"{BOLD}{CYAN}║{RESET}   GPU {gpu['index']}: {color}{bar}{RESET} {mem_pct:5.1f}% ({gpu['mem_used']}/{gpu['mem_total']}MB)  {BOLD}{CYAN}║{RESET}")

    print(f"{BOLD}{CYAN}╠══════════════════════════════════════════════════════════════╣{RESET}")

    # Performance Stats
    print(f"{BOLD}{CYAN}║{RESET} {BOLD}PERFORMANCE{RESET}                                                  {BOLD}{CYAN}║{RESET}")

    watchdog_color = RED if stats["watchdog_triggers"] > 0 else GREEN
    print(f"{BOLD}{CYAN}║{RESET}   Watchdog Triggers: {watchdog_color}{stats['watchdog_triggers']}{RESET}                                      {BOLD}{CYAN}║{RESET}")

    if stats["last_watchdog"]:
        print(f"{BOLD}{CYAN}║{RESET}   Last Watchdog: {YELLOW}{stats['last_watchdog']}{RESET}                           {BOLD}{CYAN}║{RESET}")

    print(f"{BOLD}{CYAN}║{RESET}   Recent Plays: {GREEN}{stats['recent_plays']}{RESET}                                         {BOLD}{CYAN}║{RESET}")

    if stats["last_play"]:
        print(f"{BOLD}{CYAN}║{RESET}   Last Play: {stats['last_play']}                               {BOLD}{CYAN}║{RESET}")

    print(f"{BOLD}{CYAN}╠══════════════════════════════════════════════════════════════╣{RESET}")

    # Recent Log
    print(f"{BOLD}{CYAN}║{RESET} {BOLD}RECENT ACTIVITY{RESET}                                              {BOLD}{CYAN}║{RESET}")

    # Get last few relevant lines
    relevant = []
    for line in log_lines[-20:]:
        if any(x in line for x in ["[QUEUE]", "[SPEAK]", "[WATCHDOG]", "[TRIM]"]):
            # Truncate long lines
            clean = line.strip()
            if len(clean) > 60:
                clean = clean[:57] + "..."
            relevant.append(clean)

    for line in relevant[-8:]:
        # Color code
        if "[WATCHDOG]" in line:
            print(f"{BOLD}{CYAN}║{RESET}   {RED}{line}{RESET}")
        elif "[QUEUE] Played" in line:
            print(f"{BOLD}{CYAN}║{RESET}   {GREEN}{line}{RESET}")
        elif "[QUEUE] Playing" in line:
            print(f"{BOLD}{CYAN}║{RESET}   {CYAN}{line}{RESET}")
        else:
            print(f"{BOLD}{CYAN}║{RESET}   {DIM}{line}{RESET}")

    print(f"{BOLD}{CYAN}╚══════════════════════════════════════════════════════════════╝{RESET}")
    print(f"\n{DIM}Press Ctrl+C to exit{RESET}")


def health_check() -> dict:
    """Check server health."""
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=2)
        return r.json()
    except Exception as e:
        return {"error": str(e), "ready": False}


def get_queue_state() -> dict:
    """Read queue state from file."""
    try:
        if QUEUE_STATE_FILE.exists():
            return json.loads(QUEUE_STATE_FILE.read_text())
        return {}
    except Exception:
        return {}


def send_speak(text: str, voice: str = None) -> dict:
    """Send a speak request and measure response time."""
    start = time.time()
    try:
        payload = {"text": text}
        if voice:
            payload["voice"] = voice
        r = requests.post(f"{BASE_URL}/speak", json=payload, timeout=10)
        elapsed = time.time() - start
        result = r.json()
        result["response_time_ms"] = elapsed * 1000
        result["status_code"] = r.status_code
        return result
    except Exception as e:
        elapsed = time.time() - start
        return {"error": str(e), "response_time_ms": elapsed * 1000}


def benchmark_single(text: str = None, voice: str = None):
    """Benchmark a single TTS request with detailed timing."""
    if text is None:
        text = TEST_PHRASES[2]  # Medium length

    print(f"\n{BOLD}{CYAN}{'='*60}{RESET}")
    print(f"{BOLD}Benchmarking TTS{RESET}")
    print(f"Text: \"{text[:50]}{'...' if len(text) > 50 else ''}\"")
    print(f"Voice: {voice or 'default'}")
    print(f"{CYAN}{'='*60}{RESET}")

    # Check health first
    health = health_check()
    if not health.get("ready"):
        print(f"{RED}Server not ready: {health}{RESET}")
        return

    # Send request
    print(f"\n{DIM}Sending request...{RESET}")
    result = send_speak(text, voice)
    api_time = result.get("response_time_ms", 0)

    print(f"\n{BOLD}API Response:{RESET}")
    print(f"  Time: {GREEN}{api_time:.1f}ms{RESET}")
    print(f"  Queue Size: {result.get('queue_size', 'N/A')}")

    # Wait for synthesis to complete (poll queue state)
    print(f"\n{DIM}Waiting for synthesis + playback...{RESET}")

    synthesis_start = time.time()
    max_wait = 60  # seconds
    dots = 0

    while time.time() - synthesis_start < max_wait:
        state = get_queue_state()
        playing = state.get("playing")
        queued = state.get("queued", [])

        # Show progress
        if playing:
            print(f"\r  {CYAN}Playing: {playing[:40]}...{RESET}  ", end="", flush=True)
        else:
            print(f"\r  {'.' * (dots % 4):<4}", end="", flush=True)
            dots += 1

        if not playing and not queued:
            break

        time.sleep(0.2)

    print()  # newline
    total_time = time.time() - synthesis_start

    # Parse logs for timing details
    log_lines = get_log_tail(50)
    synthesis_ms = None
    for line in reversed(log_lines):
        if "model.generate took" in line:
            match = re.search(r"model\.generate took (\d+)ms", line)
            if match:
                synthesis_ms = int(match.group(1))
                break

    print(f"\n{BOLD}Results:{RESET}")
    print(f"  API Response:     {api_time:>8.1f}ms")
    if synthesis_ms:
        print(f"  Model Generate:   {synthesis_ms:>8}ms  {CYAN}(GPU synthesis){RESET}")
    print(f"  Total Playback:   {total_time:>8.2f}s")

    # Estimate audio duration
    word_count = len(text.split())
    estimated_duration = word_count / 150 * 60  # ~150 WPM

    print(f"\n{BOLD}Text Stats:{RESET}")
    print(f"  Characters: {len(text)}")
    print(f"  Words: {word_count}")
    print(f"  Est. Speech Duration: ~{estimated_duration:.1f}s")

    if synthesis_ms and estimated_duration > 0:
        rtf = (synthesis_ms / 1000) / estimated_duration
        rtf_color = GREEN if rtf < 1 else YELLOW if rtf < 2 else RED
        print(f"\n{BOLD}Realtime Factor:{RESET} {rtf_color}{rtf:.2f}x{RESET} {'(faster than realtime)' if rtf < 1 else ''}")


def stress_test(count: int = 10, voice: str = None):
    """Send multiple concurrent requests to stress test the queue."""
    print(f"\n{BOLD}{CYAN}{'='*60}{RESET}")
    print(f"{BOLD}Stress Test: {count} concurrent requests{RESET}")
    print(f"{CYAN}{'='*60}{RESET}")

    # Check health
    health = health_check()
    if not health.get("ready"):
        print(f"{RED}Server not ready: {health}{RESET}")
        return

    # Use varied phrase lengths
    phrases = [TEST_PHRASES[i % len(TEST_PHRASES)] for i in range(count)]

    print(f"\n{DIM}Sending {count} requests concurrently...{RESET}")
    start = time.time()

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=count) as executor:
        futures = [executor.submit(send_speak, phrase, voice) for phrase in phrases]
        for i, future in enumerate(concurrent.futures.as_completed(futures)):
            result = future.result()
            results.append(result)
            status = result.get("status", result.get("error", "unknown"))
            rt = result.get("response_time_ms", 0)
            color = GREEN if status == "queued" else RED
            print(f"  [{i+1:2}/{count}] {color}{status:10}{RESET} {rt:6.1f}ms")

    total_time = time.time() - start

    # Analyze results
    response_times = [r["response_time_ms"] for r in results if "response_time_ms" in r]
    queued = sum(1 for r in results if r.get("status") == "queued")
    errors = sum(1 for r in results if "error" in r)
    queue_full = sum(1 for r in results if r.get("error") == "Queue full")

    print(f"\n{BOLD}{CYAN}{'='*60}{RESET}")
    print(f"{BOLD}Results:{RESET}")
    print(f"  Queued:      {GREEN}{queued}{RESET}/{count}")
    print(f"  Errors:      {RED if errors else DIM}{errors}{RESET} (queue full: {queue_full})")
    print(f"  Total Time:  {total_time:.2f}s")

    if response_times:
        print(f"\n{BOLD}Response Times:{RESET}")
        print(f"  Min:    {min(response_times):>8.1f}ms")
        print(f"  Max:    {max(response_times):>8.1f}ms")
        print(f"  Mean:   {statistics.mean(response_times):>8.1f}ms")
        print(f"  Median: {statistics.median(response_times):>8.1f}ms")
        if len(response_times) > 1:
            print(f"  StdDev: {statistics.stdev(response_times):>8.1f}ms")

    # Show current queue state
    state = get_queue_state()
    print(f"\n{BOLD}Queue State:{RESET}")
    playing = state.get("playing")
    if playing:
        print(f"  Playing: {playing[:50]}...")
    print(f"  Queued:  {len(state.get('queued', []))} items")

    # Estimate time to drain queue
    if state.get("queued"):
        avg_words = sum(len(p.split()) for p in state.get("queued", [])) / len(state.get("queued", []))
        est_drain = len(state.get("queued", [])) * (avg_words / 150 * 60)
        print(f"  Est. Drain Time: ~{est_drain:.0f}s")


def run_dashboard():
    """Main monitoring loop."""
    print("Starting Speak Server Monitor...")

    try:
        while True:
            gpus = get_gpu_info()
            log_lines = get_log_tail(100)
            events = parse_recent_events(log_lines)
            stats = calculate_stats(events)

            print_dashboard(gpus, stats, log_lines)

            time.sleep(2)

    except KeyboardInterrupt:
        print("\nMonitor stopped.")


def main():
    """Parse args and run appropriate command."""
    parser = argparse.ArgumentParser(
        description="Speak Server Monitor - Performance monitoring and stress testing"
    )
    parser.add_argument(
        "command",
        nargs="?",
        default="dashboard",
        choices=["dashboard", "stress", "bench", "health"],
        help="Command to run (default: dashboard)"
    )
    parser.add_argument(
        "count",
        nargs="?",
        type=int,
        default=10,
        help="Number of requests for stress test (default: 10)"
    )
    parser.add_argument(
        "--voice", "-v",
        help="Voice to use for testing"
    )
    parser.add_argument(
        "--text", "-t",
        help="Custom text for benchmark"
    )

    args = parser.parse_args()

    if args.command == "health":
        health = health_check()
        status_color = GREEN if health.get("ready") else RED
        print(f"Server: {status_color}{'ready' if health.get('ready') else 'not ready'}{RESET}")
        if health.get("error"):
            print(f"Error: {health['error']}")

    elif args.command == "bench":
        benchmark_single(args.text, args.voice)

    elif args.command == "stress":
        stress_test(args.count, args.voice)

    else:  # dashboard
        run_dashboard()


if __name__ == "__main__":
    main()
