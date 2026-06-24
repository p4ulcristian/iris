from camoufox.sync_api import Camoufox

PROFILE = "/home/paul/work/iris/skills/camoufox-profile"

with Camoufox(
    headless=False,
    os="linux",
    humanize=True,
    persistent_context=True,
    user_data_dir=PROFILE,
) as ctx:
    page = ctx.new_page()
    page.goto(
        "https://www.youtube.com/watch?v=TUVcZfQe-Kw",
        wait_until="domcontentloaded",
        timeout=60_000,
    )
    page.wait_for_timeout(3_000)
    try:
        btn = page.locator('button.ytp-play-button')
        if btn.count() and (btn.get_attribute('aria-label') or '').lower().startswith('play'):
            btn.click()
    except Exception:
        pass
    page.wait_for_timeout(60_000)
