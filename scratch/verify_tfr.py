from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    page.goto("http://localhost:3000/index.html")
    page.wait_for_timeout(2000)

    # Open layer control - Leaflet layers control expands on hover or click.
    # It seems 'Satellite View' is intercepting. We'll use force=True or hover.
    page.locator('.leaflet-control-layers').hover(force=True)
    page.wait_for_timeout(1000)

    # Look for the TFR layer checkbox and click it
    page.get_by_text("Temporary Flight Restrictions (TFR)").click(force=True)
    page.wait_for_timeout(1000)

    # Close layer control by moving mouse away
    page.mouse.move(10, 10)
    page.wait_for_timeout(1000)

    # Zoom out to see the whole US where TFRs are likely to be
    for _ in range(3):
        page.locator('.leaflet-control-zoom-out').click(force=True)
        page.wait_for_timeout(1000)

    page.wait_for_timeout(4000) # Wait for feature layer to load

    # Take screenshot
    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos",
            viewport={'width': 1280, 'height': 720}
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
