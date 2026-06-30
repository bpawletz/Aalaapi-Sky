from playwright.sync_api import sync_playwright
import time
import os
import glob

def run_cuj(page):
    # Set viewport to mobile size
    page.set_viewport_size({"width": 375, "height": 667})
    page.goto("http://localhost:3000/index.html")
    page.wait_for_timeout(1000)

    # Open the sidebar
    page.locator("#sidebar-toggle").click()
    page.wait_for_timeout(500)

    # Take screenshot of sidebar open
    page.screenshot(path="/home/jules/verification/screenshots/sidebar_open.png")
    page.wait_for_timeout(500)

    # Click the Auto Plan button
    page.locator("#auto-plan-btn").click()
    page.wait_for_timeout(1000)

    # Take screenshot of sidebar closed (after auto plan clicked)
    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos",
            viewport={"width": 375, "height": 667}
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()

    # Find the video file
    video_dir = "/home/jules/verification/videos"
    video_files = glob.glob(os.path.join(video_dir, "*.webm"))
    if video_files:
        print(f"Video saved at: {video_files[0]}")
    else:
        print("No video file found.")
