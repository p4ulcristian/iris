"""Audio playback using sounddevice."""

import logging
import queue
import threading
from typing import Iterator, Optional

import numpy as np
import sounddevice as sd

logger = logging.getLogger(__name__)


def find_prefix_trim_point(audio: np.ndarray, sample_rate: int = 24000,
                            speech_threshold: float = 0.01,
                            prefix_duration_ms: int = 350,
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


class AudioPlayer:
    """Plays audio on the server's audio output device."""

    def __init__(self, sample_rate: int = 24000, device: Optional[int] = None):
        """
        Initialize the audio player.

        Args:
            sample_rate: Audio sample rate in Hz (default: 24000 for VibeVoice)
            device: Output device index, or None for default device
        """
        self.sample_rate = sample_rate
        self.device = device
        self._lock = threading.Lock()
        self._is_playing = False
        self._stop_requested = False

    def play(self, audio: np.ndarray, blocking: bool = True) -> None:
        """
        Play audio data.

        Args:
            audio: Audio samples as float32 numpy array (values in [-1, 1])
            blocking: If True, wait for playback to complete
        """
        if audio.size == 0:
            return

        audio = np.asarray(audio, dtype=np.float32)
        if audio.ndim > 1:
            audio = audio.reshape(-1)

        peak = np.max(np.abs(audio))
        if peak > 1.0:
            audio = audio / peak

        with self._lock:
            self._is_playing = True

        try:
            sd.play(audio, samplerate=self.sample_rate, device=self.device)
            if blocking:
                sd.wait()
        finally:
            with self._lock:
                self._is_playing = False

    def play_stream(self, audio_iterator: Iterator[np.ndarray], blocking: bool = True,
                     prebuffer_ms: int = 0, trim_prefix: bool = False) -> float:
        """
        Play audio chunks from an iterator as they arrive (streaming playback).
        Uses direct writes instead of callbacks for smoother playback.

        Args:
            audio_iterator: Iterator yielding audio chunks as float32 numpy arrays
            blocking: If True, wait for playback to complete
            prebuffer_ms: Milliseconds of audio to buffer before starting playback
            trim_prefix: If True, detect and trim prefix word (e.g., "So, ") before playback

        Returns:
            Total duration in seconds
        """
        total_samples = 0
        prebuffer_samples = int(self.sample_rate * prebuffer_ms / 1000)

        # For prefix trimming, we need to buffer more audio to detect the silence
        if trim_prefix:
            prebuffer_samples = max(prebuffer_samples, int(self.sample_rate * 1.0))  # At least 1000ms for speech detection + "So, "

        def process_chunk(chunk):
            if chunk.size == 0:
                return None
            chunk = np.asarray(chunk, dtype=np.float32)
            if chunk.ndim > 1:
                chunk = chunk.reshape(-1)
            peak = np.max(np.abs(chunk))
            if peak > 1.0:
                chunk = chunk / peak
            return chunk

        with self._lock:
            self._is_playing = True
            self._stop_requested = False

        try:
            # Pre-buffer phase: collect audio before starting playback
            prebuffer = []
            prebuffer_size = 0
            iterator_exhausted = False

            for chunk in audio_iterator:
                if self._stop_requested:
                    return 0
                chunk = process_chunk(chunk)
                if chunk is None:
                    continue
                prebuffer.append(chunk)
                prebuffer_size += chunk.size

                if prebuffer_size >= prebuffer_samples:
                    break
            else:
                iterator_exhausted = True

            # Concatenate pre-buffer into one array
            if prebuffer:
                prebuffer_audio = np.concatenate(prebuffer)
            else:
                prebuffer_audio = np.array([], dtype=np.float32)

            # Trim prefix word (e.g., "So, ") if requested
            trim_offset = 0
            if trim_prefix and prebuffer_audio.size > 0:
                prebuffer_ms = prebuffer_audio.size / self.sample_rate * 1000
                logger.info(f"[TRIM] Analyzing {prebuffer_ms:.0f}ms ({prebuffer_audio.size} samples)")
                trim_offset = find_prefix_trim_point(prebuffer_audio, self.sample_rate)
                if trim_offset > 0:
                    prebuffer_audio = prebuffer_audio[trim_offset:]

            total_samples += prebuffer_audio.size

            # If iterator exhausted, just play what we have
            if iterator_exhausted:
                if prebuffer_audio.size > 0:
                    sd.play(prebuffer_audio, samplerate=self.sample_rate, device=self.device)
                    sd.wait()
                return total_samples / self.sample_rate

            # Start stream with blocking writes
            stream = sd.OutputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype=np.float32,
                device=self.device,
            )

            with stream:
                # Write silent padding to let audio device initialize
                silence = np.zeros(int(self.sample_rate * 0.03), dtype=np.float32)  # 30ms
                stream.write(silence.reshape(-1, 1))

                # Write pre-buffered audio
                if prebuffer_audio.size > 0:
                    stream.write(prebuffer_audio.reshape(-1, 1))

                # Continue with remaining chunks
                for chunk in audio_iterator:
                    if self._stop_requested:
                        break
                    chunk = process_chunk(chunk)
                    if chunk is None:
                        continue
                    total_samples += chunk.size
                    stream.write(chunk.reshape(-1, 1))

            return total_samples / self.sample_rate
        finally:
            with self._lock:
                self._is_playing = False

    def stop(self) -> None:
        """Stop any currently playing audio."""
        self._stop_requested = True
        sd.stop()
        with self._lock:
            self._is_playing = False

    @property
    def is_playing(self) -> bool:
        """Check if audio is currently playing."""
        with self._lock:
            return self._is_playing
