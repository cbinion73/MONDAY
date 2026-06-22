#!/usr/bin/env python3
"""
Double-clap launcher for Monday.

Listens to the default microphone through ffmpeg/avfoundation, detects two
short loud impulses within a small time window, and starts `npm run daemon`
only if Monday is not already healthy.
"""

from __future__ import annotations

import argparse
import contextlib
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from array import array


ROOT = "/Users/chris/CODE/MONDAY"
HEALTH_URL = os.environ.get("MONDAY_CLAP_HEALTH_URL", "http://127.0.0.1:4312/gateway/health")
LOG_FILE = os.environ.get("MONDAY_CLAP_LOG_FILE", "/tmp/monday-daemon.log")
CHUNK_MS = int(os.environ.get("MONDAY_CLAP_CHUNK_MS", "50"))
SAMPLE_RATE = int(os.environ.get("MONDAY_CLAP_SAMPLE_RATE", "16000"))
CLAP_THRESHOLD = int(os.environ.get("MONDAY_CLAP_THRESHOLD", "8000"))
CLAP_WINDOW_S = float(os.environ.get("MONDAY_CLAP_WINDOW_S", "1.2"))
CLAP_COOLDOWN_S = float(os.environ.get("MONDAY_CLAP_COOLDOWN_S", "3.0"))
CLAP_MIN_GAP_S = float(os.environ.get("MONDAY_CLAP_MIN_GAP_S", "0.12"))
DEVICE_INDEX = os.environ.get("MONDAY_CLAP_AUDIO_DEVICE_INDEX", "0")
CONFIRM_SOUND = os.environ.get("MONDAY_CLAP_CONFIRM_SOUND", "/System/Library/Sounds/Ping.aiff")
RESTART_WAIT_S = float(os.environ.get("MONDAY_CLAP_RESTART_WAIT_S", "3.0"))


def list_devices() -> int:
    cmd = [
        "ffmpeg",
        "-f",
        "avfoundation",
        "-list_devices",
        "true",
        "-i",
        "",
    ]
    return subprocess.run(cmd, check=False).returncode


def monday_is_running(url: str = HEALTH_URL, timeout: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError, ValueError):
        return False


def play_confirmation_sound() -> None:
    if not CONFIRM_SOUND or not os.path.exists(CONFIRM_SOUND):
        return
    with contextlib.suppress(Exception):
        subprocess.Popen(
            ["afplay", CONFIRM_SOUND],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )


def get_monday_pids() -> list[int]:
    patterns = [
        "src/engine/daemon/daemon.js",
        "npm run daemon",
    ]
    pids: set[int] = set()
    for pattern in patterns:
        try:
            output = subprocess.check_output(
                ["pgrep", "-f", pattern],
                text=True,
                stderr=subprocess.DEVNULL,
            )
        except subprocess.CalledProcessError:
            continue
        for line in output.splitlines():
            line = line.strip()
            if line.isdigit():
                pids.add(int(line))
    return sorted(pids)


def monday_state() -> str:
    healthy = monday_is_running()
    pids = get_monday_pids()
    if healthy:
        return "healthy"
    if pids:
        return "hung"
    return "stopped"


def stop_monday_processes() -> None:
    pids = get_monday_pids()
    if not pids:
        return

    print(f"Stopping hung Monday processes: {', '.join(str(pid) for pid in pids)}")
    for pid in pids:
        with contextlib.suppress(ProcessLookupError):
            os.kill(pid, signal.SIGTERM)

    deadline = time.time() + RESTART_WAIT_S
    while time.time() < deadline:
        if not get_monday_pids():
            return
        time.sleep(0.2)

    for pid in get_monday_pids():
        with contextlib.suppress(ProcessLookupError):
            os.kill(pid, signal.SIGKILL)


def start_monday() -> None:
    state = monday_state()
    if state == "healthy":
        print("Monday is already healthy.")
        return
    if state == "hung":
        stop_monday_processes()

    log = open(LOG_FILE, "ab", buffering=0)
    process = subprocess.Popen(
        ["npm", "run", "daemon"],
        cwd=ROOT,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    action = "Restarted" if state == "hung" else "Started"
    print(f"{action} Monday daemon (pid {process.pid}).")


def pcm_stream(device_index: str = DEVICE_INDEX):
    chunk_bytes = int(SAMPLE_RATE * (CHUNK_MS / 1000.0) * 2)
    cmd = [
        "ffmpeg",
        "-nostdin",
        "-loglevel",
        "error",
        "-f",
        "avfoundation",
        "-i",
        f":{device_index}",
        "-ac",
        "1",
        "-ar",
        str(SAMPLE_RATE),
        "-f",
        "s16le",
        "-",
    ]
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        while True:
            chunk = process.stdout.read(chunk_bytes)
            if not chunk:
                break
            yield chunk
    finally:
        stderr_text = ""
        with contextlib.suppress(Exception):
            stderr_text = process.stderr.read().decode("utf-8", errors="ignore").strip()
        with contextlib.suppress(Exception):
            process.send_signal(signal.SIGTERM)
        with contextlib.suppress(Exception):
            process.wait(timeout=1)
        if process.returncode not in (None, 0) and stderr_text:
            print(f"ffmpeg audio capture failed: {stderr_text}", file=sys.stderr)


def chunk_rms(chunk: bytes) -> float:
    samples = array("h")
    samples.frombytes(chunk)
    if not samples:
        return 0.0
    total = 0
    for sample in samples:
        total += sample * sample
    return (total / len(samples)) ** 0.5


def detect_and_launch() -> None:
    print("Listening for a double clap. Press Ctrl+C to stop.")
    clap_times: list[float] = []
    last_trigger_at = 0.0

    for chunk in pcm_stream():
        now = time.monotonic()
        rms = chunk_rms(chunk)

        if rms < CLAP_THRESHOLD:
            continue

        if clap_times and (now - clap_times[-1]) < CLAP_MIN_GAP_S:
            continue

        clap_times = [t for t in clap_times if (now - t) <= CLAP_WINDOW_S]
        clap_times.append(now)
        print(f"clap detected (rms={rms})")

        if len(clap_times) < 2:
            continue

        if (now - last_trigger_at) < CLAP_COOLDOWN_S:
            clap_times.clear()
            continue

        print("Double clap detected.")
        play_confirmation_sound()
        start_monday()
        last_trigger_at = now
        clap_times.clear()


def main() -> int:
    parser = argparse.ArgumentParser(description="Start Monday when you clap twice.")
    parser.add_argument("--list-devices", action="store_true", help="List available avfoundation devices.")
    args = parser.parse_args()

    if args.list_devices:
        return list_devices()

    detect_and_launch()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nStopped clap listener.")
        raise SystemExit(0)
