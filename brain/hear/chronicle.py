"""Chronicle - VAD-driven continuous transcription logging."""

import threading
import time
import logging
import numpy as np
import sounddevice as sd
import resampy
import sys
from pathlib import Path
from datetime import datetime, date

# Add this directory to path for sibling imports
sys.path.insert(0, str(Path(__file__).parent))

from vad import VAD, SAMPLE_RATE as VAD_SAMPLE_RATE, CHUNK_SIZE as VAD_CHUNK_SIZE
from audio import get_input_device, TARGET_SAMPLE_RATE

logger = logging.getLogger(__name__)

# Recording settings
SILENCE_THRESHOLD = 1.5  # seconds of silence to end utterance
MAX_UTTERANCE_TIME = 30  # max seconds per utterance
MIN_UTTERANCE_TIME = 0.5  # min seconds to bother transcribing

# Log directory
TRANSCRIPT_DIR = Path(__file__).parent.parent.parent / "memory" / "transcripts"


class Chronicle:
    """Continuous VAD-driven transcription logger."""

    def __init__(self, stt_model):
        """Initialize chronicle with shared STT model.

        Args:
            stt_model: SpeechToText instance from stt.py
        """
        self.stt = stt_model
        self.vad = None  # Lazy load
        self.running = False
        self.paused = False
        self._thread = None
        self._lock = threading.Lock()
        self.utterance_count = 0
        self.today_file = None

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
        """Write text to today's transcript log.

        Args:
            text: Transcribed text
            source: 'ambient' for background speech, 'input' for PTT
        """
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

    def _record_utterance(self) -> np.ndarray | None:
        """Record audio until silence is detected using VAD.

        Returns:
            Audio as float32 numpy array at 16kHz, or None if no speech.
        """
        logger.debug(f"Starting utterance recording (device={self.device}, rate={self.native_rate})")
        need_resample = self.native_rate != VAD_SAMPLE_RATE
        record_chunk = int(0.1 * self.native_rate)  # 100ms chunks

        audio_buffer = []
        all_audio = []
        vad_buffer = np.array([], dtype=np.float32)
        silence_start = None
        speech_detected = False
        start_time = time.time()

        def audio_callback(indata, frames, time_info, status):
            audio_buffer.append(indata.copy())

        try:
            with sd.InputStream(
                samplerate=self.native_rate,
                channels=1,
                dtype=np.float32,
                blocksize=record_chunk,
                device=self.device,
                callback=audio_callback
            ):
                while self.running and not self.paused:
                    elapsed = time.time() - start_time

                    # Max time check
                    if elapsed > MAX_UTTERANCE_TIME:
                        logger.debug("Max utterance time reached")
                        break

                    if audio_buffer:
                        audio = np.concatenate(audio_buffer, axis=0).flatten()
                        audio_buffer.clear()

                        # Resample to 16kHz if needed
                        if need_resample:
                            audio = resampy.resample(audio, self.native_rate, VAD_SAMPLE_RATE)

                        all_audio.append(audio)
                        vad_buffer = np.concatenate([vad_buffer, audio])

                        # Process VAD in chunks
                        while len(vad_buffer) >= VAD_CHUNK_SIZE:
                            chunk = vad_buffer[:VAD_CHUNK_SIZE]
                            vad_buffer = vad_buffer[VAD_CHUNK_SIZE:]

                            speech_prob = self.vad.get_speech_prob(chunk)

                            if speech_prob > 0.5:
                                speech_detected = True
                                silence_start = None
                            elif speech_detected:
                                # Silence after speech
                                if silence_start is None:
                                    silence_start = time.time()
                                elif time.time() - silence_start > SILENCE_THRESHOLD:
                                    logger.debug("Silence detected, ending utterance")
                                    break
                        else:
                            continue
                        break  # Exit outer loop if inner loop broke
                    else:
                        time.sleep(0.01)

        except Exception as e:
            logger.error(f"Recording error: {e}")
            return None

        if not all_audio or not speech_detected:
            return None

        full_audio = np.concatenate(all_audio)

        # Check minimum length
        duration = len(full_audio) / VAD_SAMPLE_RATE
        if duration < MIN_UTTERANCE_TIME:
            return None

        return full_audio

    def _run_loop(self):
        """Main chronicle loop - runs in background thread."""
        logger.info("Chronicle loop started")
        try:
            self._ensure_vad()
        except Exception as e:
            logger.error(f"Failed to load VAD: {e}")
            return

        logger.info("Entering main recording loop")
        while self.running:
            if self.paused:
                time.sleep(0.1)
                continue

            # Wait for speech and record utterance
            audio = self._record_utterance()

            if audio is not None and len(audio) > 0 and self.running and not self.paused:
                # Transcribe
                try:
                    text = self.stt.transcribe(audio)
                    if text:
                        self.log(text, source="ambient")
                except Exception as e:
                    logger.error(f"Transcription error: {e}")

            # Small delay between utterances
            time.sleep(0.1)

        logger.info("Chronicle loop ended")

    def start(self):
        """Start continuous transcription."""
        with self._lock:
            if self.running:
                logger.warning("Chronicle already running")
                return False

            self.running = True
            self.paused = False
            self._thread = threading.Thread(target=self._run_loop, daemon=True)
            self._thread.start()
            logger.info("Chronicle started")
            return True

    def stop(self):
        """Stop continuous transcription."""
        with self._lock:
            if not self.running:
                logger.warning("Chronicle not running")
                return False

            self.running = False
            if self._thread:
                self._thread.join(timeout=2.0)
                self._thread = None
            logger.info("Chronicle stopped")
            return True

    def pause(self):
        """Pause transcription (for PTT)."""
        self.paused = True
        logger.debug("Chronicle paused")

    def resume(self):
        """Resume transcription (after PTT)."""
        self.paused = False
        logger.debug("Chronicle resumed")

    def status(self) -> dict:
        """Get chronicle status."""
        return {
            "running": self.running,
            "paused": self.paused,
            "today_file": str(self._get_log_file()) if self.running else None,
            "utterance_count": self.utterance_count
        }
