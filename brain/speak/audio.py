"""Audio playback using sounddevice."""

import queue
import threading
from typing import Iterator, Optional

import numpy as np
import sounddevice as sd


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
                     prebuffer_ms: int = 500) -> float:
        """
        Play audio chunks from an iterator as they arrive (streaming playback).
        Uses direct writes instead of callbacks for smoother playback.

        Args:
            audio_iterator: Iterator yielding audio chunks as float32 numpy arrays
            blocking: If True, wait for playback to complete
            prebuffer_ms: Milliseconds of audio to buffer before starting playback

        Returns:
            Total duration in seconds
        """
        total_samples = 0
        prebuffer_samples = int(self.sample_rate * prebuffer_ms / 1000)

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

        try:
            # Pre-buffer phase: collect audio before starting playback
            prebuffer = []
            prebuffer_size = 0
            iterator_exhausted = False

            for chunk in audio_iterator:
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
                total_samples += prebuffer_audio.size
            else:
                prebuffer_audio = np.array([], dtype=np.float32)

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
                # Write pre-buffered audio
                if prebuffer_audio.size > 0:
                    stream.write(prebuffer_audio.reshape(-1, 1))

                # Continue with remaining chunks
                for chunk in audio_iterator:
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
        sd.stop()
        with self._lock:
            self._is_playing = False

    @property
    def is_playing(self) -> bool:
        """Check if audio is currently playing."""
        with self._lock:
            return self._is_playing
