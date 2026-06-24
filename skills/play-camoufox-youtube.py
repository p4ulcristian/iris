#!/usr/bin/env python3
"""
Play a good YouTube song in a HEADFUL Camoufox window for Paul to see and hear.

Searches YouTube for a popular track, opens the first real video result,
unmutes, forces playback, and verifies that audio is actually advancing
before reporting success. Keeps the window open so the song keeps playing.

Run with the dedicated venv:
    ~/work/iris/skills/camoufox-venv/bin/python play-camoufox-youtube.py
"""
import sys
import time
from pathlib import Path

from camoufox.sync_api import Camoufox

PROFILE = str(Path.home() / "work" / "iris" / "skills" / "camoufox-profile")

# A genuinely good, hugely popular 2024/2025 track. Search-based so we don't
# rely on a hard-coded id that might be region-locked or pulled.
QUERY = "Sabrina Carpenter Espresso official video"
SEARCH_URL = "https://www.youtube.com/results?search_query=" + QUERY.replace(" ", "+")


def main() -> int:
    print(f"Launching headful Camoufox, searching: {QUERY}")
    with Camoufox(
        headless=False,            # headful so Paul can see & hear it
        humanize=True,
        os="linux",
        persistent_context=True,
        user_data_dir=PROFILE,
    ) as ctx:
        page = ctx.new_page()

        # Search results page, then click the first video link.
        page.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(3_000)

        # Dismiss a consent dialog if one appears.
        for label in ("Accept all", "Reject all", "I agree"):
            try:
                btn = page.get_by_role("button", name=label)
                if btn.count() > 0:
                    btn.first.click(timeout=2_000)
                    page.wait_for_timeout(1_000)
                    break
            except Exception:
                pass

        # First actual watch link.
        link = page.locator("a#video-title, ytd-video-renderer a#thumbnail").first
        link.wait_for(state="visible", timeout=20_000)
        title_attr = link.get_attribute("title") or "(first result)"
        print(f"Opening: {title_attr}")
        link.click()

        # Wait for the watch page / player.
        page.wait_for_url("**/watch**", timeout=30_000)
        page.wait_for_selector("video", timeout=30_000)
        page.wait_for_timeout(3_000)

        # Force unmute + play via the HTML5 video element and the player API.
        page.evaluate(
            """() => {
                const v = document.querySelector('video');
                if (v) { v.muted = false; v.volume = 1.0; v.play().catch(()=>{}); }
                const p = document.querySelector('#movie_player');
                if (p && p.unMute) { p.unMute(); p.setVolume(100); }
                if (p && p.playVideo) { p.playVideo(); }
            }"""
        )

        # If a big play button is overlaid, click it.
        try:
            pb = page.locator(".ytp-large-play-button, button.ytp-play-button")
            if pb.count() > 0:
                pb.first.click(timeout=2_000)
        except Exception:
            pass

        # Verify audio is actually playing: currentTime must advance while
        # the element is not paused and not muted.
        def state():
            return page.evaluate(
                """() => {
                    const v = document.querySelector('video');
                    if (!v) return null;
                    return {t: v.currentTime, paused: v.paused, muted: v.muted,
                            vol: v.volume, dur: v.duration};
                }"""
            )

        s1 = state()
        time.sleep(3.0)
        s2 = state()
        print(f"player state #1: {s1}")
        print(f"player state #2: {s2}")

        playing = (
            s1 and s2
            and not s2["paused"]
            and not s2["muted"]
            and s2["vol"] > 0
            and s2["t"] > (s1["t"] if s1 else 0)
        )

        page_title = page.title()
        if playing:
            print(f"\nRESULT: PLAYING — {page_title}")
            print(f"position advanced {s1['t']:.1f}s -> {s2['t']:.1f}s, vol {s2['vol']}")
            # Keep the window open so the song keeps playing.
            print("Keeping window open; song will continue.")
            # Sleep long enough for the track to play; detach-style.
            time.sleep(600)
            return 0
        else:
            print(f"\nRESULT: NOT CONFIRMED PLAYING — {page_title}")
            time.sleep(30)
            return 1


if __name__ == "__main__":
    sys.exit(main())
