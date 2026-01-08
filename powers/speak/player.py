"""Simple audio player using aplay subprocess.

No Python audio libraries. Just write WAV, play with aplay, kill to stop.
"""

import logging
import os
import subprocess
import tempfile
import threading
import wave
from multiprocessing.connection import Connection
from typing import Optional

import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [PLAYER] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)


class Player:
    """Dead simple audio player using aplay."""

    def __init__(self, sample_rate: int = 24000):
        self.sample_rate = sample_rate
        self._process: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()

    def play(self, audio: np.ndarray) -> dict:
        """Play audio by writing WAV and calling aplay."""
        if audio.size == 0:
            return {"status": "done", "duration": 0.0}

        # Ensure float32, mono
        audio = np.asarray(audio, dtype=np.float32)
        if audio.ndim > 1:
            audio = audio.reshape(-1)

        # Normalize
        peak = np.max(np.abs(audio))
        if peak > 1.0:
            audio = audio / peak

        # Convert to 16-bit PCM
        audio_int16 = (audio * 32767).astype(np.int16)
        duration = len(audio_int16) / self.sample_rate

        # Write to temp WAV file
        fd, wav_path = tempfile.mkstemp(suffix='.wav')
        try:
            with wave.open(wav_path, 'wb') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)  # 16-bit
                wf.setframerate(self.sample_rate)
                wf.writeframes(audio_int16.tobytes())

            # Play with paplay (PulseAudio/PipeWire)
            with self._lock:
                self._process = subprocess.Popen(
                    ["/usr/bin/paplay", wav_path],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )

            # Wait for playback to complete
            returncode = self._process.wait()

            with self._lock:
                self._process = None

            if returncode == 0:
                return {"status": "done", "duration": duration}
            elif returncode == -9 or returncode == -15:  # SIGKILL or SIGTERM
                return {"status": "stopped"}
            else:
                return {"status": "error", "error": f"aplay returned {returncode}"}

        except Exception as e:
            logger.error(f"Playback error: {e}")
            return {"status": "error", "error": str(e)}
        finally:
            # Clean up temp file
            try:
                os.close(fd)
                os.unlink(wav_path)
            except:
                pass

    def stop(self) -> dict:
        """Stop playback by killing aplay process."""
        with self._lock:
            if self._process is not None:
                try:
                    self._process.kill()
                except:
                    pass
        return {"status": "stopped"}


def player_loop(pipe: Connection, sample_rate: int = 24000, device=None):
    """
    Main loop for the player subprocess.

    Protocol:
        Receive: {"cmd": "play", "audio": np.ndarray}
                 {"cmd": "stop"}
                 {"cmd": "shutdown"}

        Send:    {"status": "done", "duration": float}
                 {"status": "stopped"}
                 {"status": "error", "error": str}
    """
    logger.info(f"Player subprocess started (sample_rate={sample_rate})")

    player = Player(sample_rate=sample_rate)
    play_thread = None
    play_result = None
    play_result_lock = threading.Lock()

    def play_in_thread(audio):
        nonlocal play_result
        try:
            result = player.play(audio)
        except Exception as e:
            logger.error(f"Play thread crashed: {e}")
            result = {"status": "error", "error": str(e)}
        with play_result_lock:
            play_result = result

    while True:
        try:
            # Check for commands frequently
            if not pipe.poll(timeout=0.1):
                # Check if play finished
                if play_thread is not None and not play_thread.is_alive():
                    with play_result_lock:
                        if play_result is not None:
                            pipe.send(play_result)
                            play_result = None
                        else:
                            logger.error("Play thread died without result")
                            pipe.send({"status": "error", "error": "Thread died"})
                    play_thread = None
                continue

            msg = pipe.recv()
            cmd = msg.get("cmd")

            if cmd == "shutdown":
                logger.info("Shutdown requested")
                player.stop()
                if play_thread is not None:
                    play_thread.join(timeout=1.0)
                pipe.send({"status": "shutdown"})
                break

            elif cmd == "stop":
                player.stop()
                if play_thread is not None:
                    play_thread.join(timeout=2.0)
                    play_thread = None
                    with play_result_lock:
                        play_result = None
                pipe.send({"status": "stopped"})

            elif cmd == "play":
                # Stop any current playback
                if play_thread is not None and play_thread.is_alive():
                    player.stop()
                    play_thread.join(timeout=1.0)
                    play_thread = None

                audio = msg.get("audio")
                if audio is None:
                    pipe.send({"status": "error", "error": "No audio data"})
                    continue

                # Start playback in thread
                with play_result_lock:
                    play_result = None
                play_thread = threading.Thread(target=play_in_thread, args=(audio,))
                play_thread.start()

            else:
                pipe.send({"status": "error", "error": f"Unknown command: {cmd}"})

        except EOFError:
            logger.info("Pipe closed, exiting")
            break
        except Exception as e:
            logger.error(f"Error in player loop: {e}")
            try:
                pipe.send({"status": "error", "error": str(e)})
            except:
                pass

    logger.info("Player subprocess exiting")


if __name__ == "__main__":
    # Quick test
    print("Testing aplay player...")
    player = Player()

    # Generate test tone
    t = np.linspace(0, 1, 24000)
    audio = 0.3 * np.sin(2 * np.pi * 440 * t).astype(np.float32)

    print("Playing 1 second 440Hz tone...")
    result = player.play(audio)
    print(f"Result: {result}")
