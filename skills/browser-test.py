#!/usr/bin/env python3
"""
Camoufox smoke test for iris.

Launches Camoufox (a stealth Firefox), opens YouTube, prints the page title,
and reports whether anything that looks like a bot / consent wall blocked us.

Run it with the dedicated venv that has camoufox installed:

    ~/work/iris/skills/camoufox-venv/bin/python ~/work/iris/skills/browser-test.py

Flags:
    --headed     show the window (default is headless 'virtual' on Linux)
    --profile DIR  use a persistent profile dir so logins are remembered
                   (default: ~/work/iris/skills/camoufox-profile)

See camoufox-report.md for how iris should use this for logged-in sessions.
"""
import argparse
import sys
from pathlib import Path

from camoufox.sync_api import Camoufox

DEFAULT_PROFILE = Path.home() / "work" / "iris" / "skills" / "camoufox-profile"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--headed", action="store_true", help="show the browser window")
    ap.add_argument("--url", default="https://youtube.com", help="URL to open")
    ap.add_argument(
        "--profile",
        default=str(DEFAULT_PROFILE),
        help="persistent profile dir (logins persist here)",
    )
    args = ap.parse_args()

    # headless=True is native Firefox headless (no Xvfb needed). 'virtual' would
    # use an Xvfb display but requires the xorg-server-xvfb package. --headed
    # shows a real window (works here via Xwayland on the Hyprland desktop).
    headless = False if args.headed else True

    profile_dir = Path(args.profile)
    profile_dir.mkdir(parents=True, exist_ok=True)

    print(f"Launching Camoufox (headless={headless!r}) with profile {profile_dir} ...")

    # persistent_context + user_data_dir => the context IS the browser; any login
    # cookies/storage are written to user_data_dir and reused next run.
    with Camoufox(
        headless=headless,
        humanize=True,
        os="linux",
        persistent_context=True,
        user_data_dir=str(profile_dir),
    ) as context:
        page = context.new_page()
        page.goto(args.url, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(2_500)  # let the SPA settle

        title = page.title()
        url = page.url
        print(f"\nPage title : {title}")
        print(f"Final URL  : {url}")

        body = (page.inner_text("body")[:4000] or "").lower()
        flags = [
            kw
            for kw in (
                "are you a robot",
                "unusual traffic",
                "verify you are human",
                "captcha",
                "detected unusual",
            )
            if kw in body
        ]

        signed_in = page.locator("button#avatar-btn, ytd-topbar-menu-button-renderer #avatar-btn").count() > 0

        if flags:
            print(f"\n[WARN] possible bot/consent wall: {flags}")
        else:
            print("\n[OK] no obvious bot-detection or captcha wall hit.")
        print(f"[INFO] appears signed in: {signed_in}")

        ok = "youtube" in title.lower() and not flags
        print("\nRESULT:", "PASS" if ok else "CHECK OUTPUT")
        return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
