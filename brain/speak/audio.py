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

    def play_stream(self, audio_iterator: Iterator[np.ndarray], blocking: bool = True) -> float:
        """
        Play audio chunks from an iterator as they arrive (streaming playback).

        Args:
            audio_iterator: Iterator yielding audio chunks as float32 numpy arrays
            blocking: If True, wait for playback to complete

        Returns:
            Total duration in seconds
        """
        audio_queue = queue.Queue()
        finished = threading.Event()
        total_samples = [0]

        def audio_callback(outdata, frames, time, status):
            try:
                chunk = audio_queue.get_nowait()
                if chunk.size < frames:
                    outdata[:chunk.size, 0] = chunk
                    outdata[chunk.size:, 0] = 0
                else:
                    outdata[:, 0] = chunk[:frames]
                    if chunk.size > frames:
                        audio_queue.put(chunk[frames:])
            except queue.Empty:
                if finished.is_set():
                    raise sd.CallbackStop()
                outdata.fill(0)

        with self._lock:
            self._is_playing = True

        try:
            blocksize = 2400  # 100ms at 24kHz
            stream = sd.OutputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype=np.float32,
                callback=audio_callback,
                blocksize=blocksize,
                device=self.device,
            )

            with stream:
                for chunk in audio_iterator:
                    if chunk.size == 0:
                        continue

                    chunk = np.asarray(chunk, dtype=np.float32)
                    if chunk.ndim > 1:
                        chunk = chunk.reshape(-1)

                    peak = np.max(np.abs(chunk))
                    if peak > 1.0:
                        chunk = chunk / peak

                    total_samples[0] += chunk.size
                    audio_queue.put(chunk)

                finished.set()

                if blocking:
                    while not audio_queue.empty() or stream.active:
                        sd.sleep(50)

            return total_samples[0] / self.sample_rate
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
