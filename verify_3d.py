import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Record video to check animations or popups
        context = await browser.new_context(record_video_dir="/app/verification/screenshots/")
        page = await context.new_page()

        # Assuming python3 -m http.server 3000 is running
        await page.goto("http://localhost:3000/index.html")

        # 1. Click map to place a waypoint
        await page.evaluate("map.fire('click', {latlng: L.latLng(35.0, -120.0)})")

        # 2. Wait for API to resolve and Three.js canvas to render
        # We need to wait for the open-meteo batch to complete.
        await page.wait_for_timeout(3000)

        # 3. Take screenshot
        await page.screenshot(path="/app/verification/screenshots/verification2.png", full_page=True)

        await context.close()
        await browser.close()

asyncio.run(run())
