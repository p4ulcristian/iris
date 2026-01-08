"""Chronicle - Continuous transcription with parallel batching."""

import threading
import queue
import time
import logging
import numpy as np
import sounddevice as sd
import resampy
import sys
from pathlib import Path
from datetime import datetime, date
from concurrent.futures import ThreadPoolExecutor

# Add this directory to path for sibling imports
sys.path.insert(0, str(Path(__file__).parent))

from vad import VAD, SAMPLE_RATE as VAD_SAMPLE_RATE, CHUNK_SIZE as VAD_CHUNK_SIZE
from audio import get_input_device, TARGET_SAMPLE_RATE

logger = logging.getLogger(__name__)

# Recording settings
SILENCE_THRESHOLD = 1.5  # seconds of silence to end batch
MAX_BATCH_TIME = 30  # max seconds per batch
MIN_BATCH_TIME = 0.3  # min seconds to bother transcribing

# Log directory
TRANSCRIPT_DIR = Path(__file__).parent.parent.parent / "memory" / "transcripts"


class Chronicle:
    """Continuous transcription with parallel batching.

    Recording never stops. VAD detects silence to end batches.
    Transcription runs in parallel threads.
    """

    def __init__(self, stt_model):
        """Initialize chronicle with shared STT model."""
        self.stt = stt_model
        self.vad = None  # Lazy load
        self.running = False
        self.paused = False
        self._record_thread = None
        self._lock = threading.Lock()

        # Stats
        self.utterance_count = 0
        self.today_file = None
        self.start_time = None
        self.batch_start = None  # When current batch started
        self.current_volume = 0.0
        self.speech_prob = 0.0

        # Transcription queue and thread pool
        self._transcribe_queue = queue.Queue()
        self._executor = None

        # Audio config
        self.device, self.native_rate = get_input_device()

    def _ensure_vad(self):
        """Lazy load VAD model."""
        if self.vad is None:
            self.vad = VAD()

    def _get_log_file(self) -> Path:
        """Get today's log file path, creating directory if needed."""
        today = date.today().isoformat()
        if self.today_file is None or today not in str(self.today_file):
            TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)
            self.today_file = TRANSCRIPT_DIR / f"{today}.txt"
        return self.today_file

    def log(self, text: str, source: str = "ambient"):
        """Write text to today's transcript log."""
        if not text or not text.strip():
            return

        timestamp = datetime.now().strftime("%H:%M:%S")
        prefix = "[input] " if source == "input" else ""
        line = f"[{timestamp}] {prefix}{text.strip()}\n"

        log_file = self._get_log_file()
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(line)

        self.utterance_count += 1
        logger.info(f"Chronicle logged: {text.strip()[:50]}...")

    def _transcribe_worker(self, audio: np.ndarray):
        """Transcribe audio in background thread."""
        try:
            text = self.stt.transcribe(audio)
            if text:
                self.log(text, source="ambient")
        except Exception as e:
            logger.error(f"Transcription error: {e}")

    def _recording_loop(self):
        """Main recording loop - runs continuously, never waits for speech."""
        logger.info("Chronicle recording loop started")

        try:
            self._ensure_vad()
        except Exception as e:
            logger.error(f"Failed to load VAD: {e}")
            return

        need_resample = self.native_rate != VAD_SAMPLE_RATE
        record_chunk = int(0.1 * self.native_rate)  # 100ms chunks

        audio_buffer = []
        batch_audio = []
        vad_buffer = np.array([], dtype=np.float32)
        silence_start = None
        has_speech = False

        def audio_callback(indata, frames, time_info, status):
            if not self.paused:
                audio_buffer.append(indata.copy())

        logger.info("Starting continuous audio capture")

        try:
            with sd.InputStream(
                samplerate=self.native_rate,
                channels=1,
                dtype=np.float32,
                blocksize=record_chunk,
                device=self.device,
                callback=audio_callback
            ):
                # Start first batch immediately
                self.batch_start = time.time()

                while self.running:
                    if self.paused:
                        time.sleep(0.05)
                        continue

                    if not audio_buffer:
                        time.sleep(0.01)
                        continue

                    # Process available audio
                    audio = np.concatenate(audio_buffer, axis=0).flatten()
                    audio_buffer.clear()

                    # Update volume
                    rms = np.sqrt(np.mean(audio ** 2))
                    self.current_volume = min(1.0, rms * 10)

                    # Resample if needed
                    if need_resample:
                        audio = resampy.resample(audio, self.native_rate, VAD_SAMPLE_RATE)

                    # Add to current batch
                    batch_audio.append(audio)
                    vad_buffer = np.concatenate([vad_buffer, audio])

                    # Check VAD for silence detection
                    while len(vad_buffer) >= VAD_CHUNK_SIZE:
                        chunk = vad_buffer[:VAD_CHUNK_SIZE]
                        vad_buffer = vad_buffer[VAD_CHUNK_SIZE:]

                        speech_prob = self.vad.get_speech_prob(chunk)
                        self.speech_prob = speech_prob

                        if speech_prob > 0.5:
                            has_speech = True
                            silence_start = None
                        else:
                            # Silence detected
                            if silence_start is None:
                                silence_start = time.time()

                    # Check if batch should end
                    batch_duration = time.time() - self.batch_start
                    silence_duration = time.time() - silence_start if silence_start else 0

                    should_end_batch = (
                        (has_speech and silence_duration > SILENCE_THRESHOLD) or
                        batch_duration > MAX_BATCH_TIME
                    )

                    if should_end_batch and batch_audio:
                        # Combine batch audio
                        full_audio = np.concatenate(batch_audio)
                        batch_duration = len(full_audio) / VAD_SAMPLE_RATE

                        # Only transcribe if has speech and long enough
                        if has_speech and batch_duration >= MIN_BATCH_TIME:
                            logger.debug(f"Batch ended: {batch_duration:.1f}s, submitting for transcription")
                            # Submit to thread pool (non-blocking)
                            self._executor.submit(self._transcribe_worker, full_audio)

                        # Start new batch immediately
                        batch_audio = []
                        vad_buffer = np.array([], dtype=np.float32)
                        silence_start = None
                        has_speech = False
                        self.batch_start = time.time()

        except Exception as e:
            logger.error(f"Recording error: {e}")

        logger.info("Chronicle recording loop ended")

    def start(self):
        """Start continuous transcription."""
        with self._lock:
            if self.running:
                logger.warning("Chronicle already running")
                return False

            self.running = True
            self.paused = False
            self.start_time = time.time()
            self.batch_start = time.time()

            # Start thread pool for transcription (2 workers)
            self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="transcribe")

            # Start recording thread
            self._record_thread = threading.Thread(target=self._recording_loop, daemon=True)
            self._record_thread.start()

            logger.info("Chronicle started with parallel transcription")
            return True

    def stop(self):
        """Stop continuous transcription."""
        with self._lock:
            if not self.running:
                logger.warning("Chronicle not running")
                return False

            self.running = False
            self.start_time = None
            self.batch_start = None
            self.current_volume = 0.0

            if self._record_thread:
                self._record_thread.join(timeout=2.0)
                self._record_thread = None

            if self._executor:
                self._executor.shutdown(wait=False)
                self._executor = None

            logger.info("Chronicle stopped")
            return True

    def pause(self):
        """Pause transcription (for PTT)."""
        self.paused = True
        logger.debug("Chronicle paused")

    def resume(self):
        """Resume transcription (after PTT)."""
        self.paused = False
        self.batch_start = time.time()  # Reset batch timer
        logger.debug("Chronicle resumed")

    def status(self) -> dict:
        """Get chronicle status."""
        import sounddevice as sd
        device_name = None
        if self.device is not None:
            try:
                device_name = sd.query_devices(self.device)["name"]
            except:
                pass

        return {
            "running": self.running,
            "paused": self.paused,
            "today_file": str(self._get_log_file()) if self.running else None,
            "utterance_count": self.utterance_count,
            "start_time": self.start_time,
            "batch_start": self.batch_start,
            "volume": self.current_volume,
            "vad": self.speech_prob,
            "device": device_name
        }
