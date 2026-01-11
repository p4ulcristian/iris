"""Audio playback using isolated subprocess."""

import logging
import multiprocessing
import os
import signal
import threading
import time
from multiprocessing.connection import Connection
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Default timeout for playback (seconds)
DEFAULT_PLAYBACK_TIMEOUT = 60.0

# Path to this module's directory (for subprocess imports)
_MODULE_DIR = os.path.dirname(os.path.abspath(__file__))


def _player_subprocess_entry(pipe: Connection, sample_rate: int, device):
    """Entry point for player subprocess - sets up imports then runs loop."""
    import sys
    # Add the speak directory to path so player.py can be imported
    if _MODULE_DIR not in sys.path:
        sys.path.insert(0, _MODULE_DIR)

    from player import player_loop
    player_loop(pipe, sample_rate, device)


def find_prefix_trim_point(audio: np.ndarray, sample_rate: int = 24000,
                            speech_threshold: float = 0.01,
                            prefix_duration_ms: int = 300,
                            chunk_ms: int = 10) -> int:
    """
    Find where to trim the "So, " prefix from TTS output.

    Strategy: Find where speech starts, then skip a fixed duration for "So, ".
    This works because TTS doesn't add clear pauses after commas.

    Args:
        audio: Audio samples
        sample_rate: Audio sample rate
        speech_threshold: Energy threshold for speech detection
        prefix_duration_ms: Expected duration of "So, " (~300-400ms)
        chunk_ms: Analysis chunk size

    Returns the sample index to start playback from, or 0 if no speech found.
    """
    chunk_size = int(sample_rate * chunk_ms / 1000)
    min_speech_chunks = 5  # 50ms of speech to confirm

    energies = []
    for i in range(0, len(audio) - chunk_size, chunk_size):
        chunk = audio[i:i + chunk_size]
        energy = np.sqrt(np.mean(chunk ** 2))  # RMS energy
        energies.append((i, energy))

    if not energies:
        return 0

    # Find where speech starts
    speech_start_idx = None
    consecutive_speech = 0
    for i, (sample_idx, energy) in enumerate(energies):
        if energy > speech_threshold:
            consecutive_speech += 1
            if consecutive_speech >= min_speech_chunks:
                speech_start_idx = i - min_speech_chunks + 1
                break
        else:
            consecutive_speech = 0

    if speech_start_idx is None:
        logger.info(f"[TRIM] No speech found (threshold={speech_threshold})")
        return 0

    speech_start_sample = energies[speech_start_idx][0]
    speech_start_ms = speech_start_sample / sample_rate * 1000

    # Trim point is speech_start + prefix_duration
    trim_sample = speech_start_sample + int(sample_rate * prefix_duration_ms / 1000)
    trim_ms = trim_sample / sample_rate * 1000

    # Make sure we don't trim past the available audio
    if trim_sample >= len(audio):
        logger.info(f"[TRIM] Trim point {trim_ms:.0f}ms exceeds audio length")
        return 0

    logger.info(f"[TRIM] Speech at {speech_start_ms:.0f}ms, trimming {prefix_duration_ms}ms prefix -> {trim_ms:.0f}ms")
    return trim_sample


class PlayerSubprocess:
    """
    Manages an isolated subprocess for audio playback.

    The subprocess can be killed and respawned if it hangs, providing
    fault isolation from audio subsystem issues.
    """

    def __init__(self, sample_rate: int = 24000, device: Optional[int] = None):
        """
        Initialize the player subprocess manager.

        Args:
            sample_rate: Audio sample rate in Hz
            device: Output device index, or None for default
        """
        self.sample_rate = sample_rate
        self.device = device
        self._process: Optional[multiprocessing.Process] = None
        self._pipe: Optional[Connection] = None
        self._pipe_lock = threading.Lock()  # Protect pipe from concurrent access
        self._start_count = 0

    def _start(self) -> None:
        """Start or restart the player subprocess."""
        # Clean up any existing process
        self._cleanup()

        parent_conn, child_conn = multiprocessing.Pipe()
        self._pipe = parent_conn

        self._process = multiprocessing.Process(
            target=_player_subprocess_entry,
            args=(child_conn, self.sample_rate, self.device),
            daemon=True  # Die with parent
        )
        self._process.start()
        self._start_count += 1
        logger.info(f"[PLAYER] Subprocess started (pid={self._process.pid}, count={self._start_count})")

    def _cleanup(self) -> None:
        """Clean up the subprocess."""
        if self._process is not None:
            if self._process.is_alive():
                logger.info(f"[PLAYER] Killing subprocess (pid={self._process.pid})")
                self._process.kill()
                self._process.join(timeout=1.0)
            self._process = None

        if self._pipe is not None:
            try:
                self._pipe.close()
            except:
                pass
            self._pipe = None

    def _ensure_running(self) -> bool:
        """Ensure subprocess is running, start if needed."""
        if self._process is None or not self._process.is_alive():
            self._start()
        return self._process is not None and self._process.is_alive()

    def play(self, audio: np.ndarray, timeout: float = DEFAULT_PLAYBACK_TIMEOUT) -> dict:
        """
        Play audio in the subprocess.

        Args:
            audio: Audio samples as float32 numpy array
            timeout: Maximum time to wait for playback (seconds)

        Returns:
            Dict with status: "done", "timeout", "error", or "stopped"
        """
        if audio.size == 0:
            return {"status": "done", "duration": 0.0}

        if not self._ensure_running():
            return {"status": "error", "error": "Failed to start subprocess"}

        try:
            # Send play command (protected by lock to avoid concurrent writes)
            with self._pipe_lock:
                self._pipe.send({"cmd": "play", "audio": audio})

            # Wait for response with timeout (can be interrupted by stop)
            if self._pipe.poll(timeout):
                return self._pipe.recv()
            else:
                # Timeout - subprocess is hung
                logger.warning(f"[PLAYER] Playback timeout after {timeout}s, restarting subprocess")
                self._start()  # Kill and restart
                return {"status": "timeout"}

        except (BrokenPipeError, EOFError, OSError) as e:
            logger.error(f"[PLAYER] Pipe error: {e}, restarting subprocess")
            self._start()
            return {"status": "error", "error": str(e)}

    def stop(self) -> dict:
        """Stop current playback.

        Note: This only SENDS the stop command - it does NOT read the response.
        The queue worker's play() call will receive the response.
        This avoids race conditions between Flask thread and queue worker.
        """
        if self._pipe is None or self._process is None or not self._process.is_alive():
            return {"status": "stopped"}

        try:
            with self._pipe_lock:
                self._pipe.send({"cmd": "stop"})
            # Don't read response - queue worker will get it
            return {"status": "stopped"}
        except (BrokenPipeError, EOFError, OSError) as e:
            logger.warning(f"[PLAYER] Stop pipe error (will recover on next play): {e}")
            return {"status": "stopped"}

    def shutdown(self) -> None:
        """Shutdown the subprocess gracefully."""
        if self._pipe is not None and self._process is not None and self._process.is_alive():
            try:
                with self._pipe_lock:
                    self._pipe.send({"cmd": "shutdown"})
                self._process.join(timeout=2.0)
            except:
                pass
        self._cleanup()

    @property
    def is_alive(self) -> bool:
        """Check if subprocess is running."""
        return self._process is not None and self._process.is_alive()


# Legacy compatibility - simple wrapper class
class AudioPlayer:
    """
    Legacy-compatible audio player using subprocess isolation.

    This provides the same interface as the old AudioPlayer but uses
    a subprocess for fault isolation.
    """

    def __init__(self, sample_rate: int = 24000, device: Optional[int] = None):
        self.sample_rate = sample_rate
        self._subprocess = PlayerSubprocess(sample_rate=sample_rate, device=device)
        self._is_playing = False

    def play(self, audio: np.ndarray, blocking: bool = True, trim_prefix: bool = False, volume: float = 1.0) -> float:
        """
        Play audio data.

        Args:
            audio: Audio samples as float32 numpy array
            blocking: If True, wait for playback to complete
            trim_prefix: If True, trim the "So, " prefix
            volume: Volume level 0.0 to 1.0

        Returns:
            Duration in seconds (0 if non-blocking or error)
        """
        if audio.size == 0:
            return 0.0

        audio = np.asarray(audio, dtype=np.float32)
        if audio.ndim > 1:
            audio = audio.reshape(-1)

        # Normalize
        peak = np.max(np.abs(audio))
        if peak > 1.0:
            audio = audio / peak

        # Apply volume
        if volume < 1.0:
            audio = audio * volume

        # Trim prefix if requested
        if trim_prefix:
            trim_offset = find_prefix_trim_point(audio, self.sample_rate)
            if trim_offset > 0:
                audio = audio[trim_offset:]
                # Apply short fade-in to smooth the transition (10ms)
                fade_samples = min(int(self.sample_rate * 0.01), len(audio))
                if fade_samples > 0:
                    fade_curve = np.linspace(0, 1, fade_samples, dtype=np.float32)
                    audio[:fade_samples] = audio[:fade_samples] * fade_curve

        self._is_playing = True
        try:
            if blocking:
                result = self._subprocess.play(audio)
                return result.get("duration", 0.0)
            else:
                # Non-blocking not really supported with subprocess model
                # Just play and return immediately
                self._subprocess.play(audio, timeout=0.1)
                return 0.0
        finally:
            self._is_playing = False

    def stop(self) -> None:
        """Stop current playback."""
        self._subprocess.stop()
        self._is_playing = False

    def shutdown(self) -> None:
        """Shutdown the player subprocess."""
        self._subprocess.shutdown()

    @property
    def is_playing(self) -> bool:
        return self._is_playing
