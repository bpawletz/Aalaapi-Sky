#!/usr/bin/env python3
"""
Aalaapi Sky - Video Worker (OpenCV Ingest & Recording Pipeline)

Captures video feeds from RTMP, RTSP, UVC/USB capture cards, or a synthetic HUD test pattern.
Compresses frames to JPEG for low-latency binary casting and records uncompressed/lossless
MP4 streams to disk concurrently.

Communication with Node.js companion service:
- stdin: JSON control commands (newline-delimited)
- stdout: Binary JPEG byte stream with 4-byte big-endian length headers
- stderr: JSON status and log events prefixed with "STATUS:" or "LOG:"
"""

import sys
import os
import json
import time
import math
import threading

try:
    import cv2
    import numpy as np
    OPENCV_AVAILABLE = True
except ImportError:
    OPENCV_AVAILABLE = False


class VideoWorker:
    def __init__(self):
        self.source = "test"
        self.quality = 75
        self.target_fps = 30
        self.width = 1280
        self.height = 720
        self.running = True
        self.cap = None
        self.writer = None
        self.recording = False
        self.record_path = None
        self.record_start_time = 0
        self.record_frame_count = 0
        self.lock = threading.Lock()
        self.synth_step = 0

    def log(self, msg):
        sys.stderr.write(f"LOG: {msg}\n")
        sys.stderr.flush()

    def send_status(self, extra=None):
        payload = {
            "source": self.source,
            "width": self.width,
            "height": self.height,
            "fps": self.target_fps,
            "recording": self.recording,
            "recordPath": self.record_path,
            "recordDurationSec": round(time.time() - self.record_start_time, 1) if self.recording else 0,
            "recordFrames": self.record_frame_count if self.recording else 0
        }
        if extra:
            payload.update(extra)
        sys.stderr.write(f"STATUS: {json.dumps(payload)}\n")
        sys.stderr.flush()

    def set_source(self, new_source):
        with self.lock:
            self.source = str(new_source).strip()
            if self.cap is not None:
                try:
                    self.cap.release()
                except Exception:
                    pass
                self.cap = None
            self.log(f"Switched video source to: {self.source}")
            self.send_status()

    def open_capture(self):
        if not OPENCV_AVAILABLE or self.source == "test":
            return None

        # Check if source is integer (device index)
        try:
            dev_idx = int(self.source)
            cap = cv2.VideoCapture(dev_idx, cv2.CAP_DSHOW if os.name == 'nt' else cv2.CAP_ANY)
        except ValueError:
            cap = cv2.VideoCapture(self.source)

        if cap and cap.isOpened():
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            self.log(f"Successfully opened capture device/feed: {self.source}")
            return cap
        else:
            self.log(f"Could not open feed: {self.source}, falling back to synthetic generator")
            if cap:
                cap.release()
            return None

    def start_recording(self, file_path):
        with self.lock:
            if self.recording:
                self.stop_recording()

            if not file_path:
                file_path = f"recording_{int(time.time())}.mp4"

            # Ensure parent directory exists
            pdir = os.path.dirname(os.path.abspath(file_path))
            if pdir and not os.path.exists(pdir):
                os.makedirs(pdir, exist_ok=True)

            if OPENCV_AVAILABLE:
                # Use mp4v or H264 fourcc
                fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                self.writer = cv2.VideoWriter(file_path, fourcc, self.target_fps, (self.width, self.height))
                if not self.writer.isOpened():
                    # Fallback to MJPG or XVID if mp4v fails
                    self.writer = cv2.VideoWriter(file_path, cv2.VideoWriter_fourcc(*'MJPG'), self.target_fps, (self.width, self.height))

            self.recording = True
            self.record_path = file_path
            self.record_start_time = time.time()
            self.record_frame_count = 0
            self.log(f"Started local recording -> {file_path}")
            self.send_status({"event": "record_started", "file": file_path})

    def stop_recording(self):
        with self.lock:
            if not self.recording:
                return

            duration = round(time.time() - self.record_start_time, 2)
            frames = self.record_frame_count
            saved_file = self.record_path

            if self.writer is not None:
                try:
                    self.writer.release()
                except Exception:
                    pass
                self.writer = None

            file_size = 0
            if saved_file and os.path.exists(saved_file):
                file_size = os.path.getsize(saved_file)

            self.recording = False
            self.record_path = None
            self.record_start_time = 0
            self.record_frame_count = 0
            self.log(f"Stopped local recording: {saved_file} ({duration}s, {frames} frames, {file_size} bytes)")
            self.send_status({
                "event": "record_stopped",
                "file": saved_file,
                "durationSec": duration,
                "frames": frames,
                "bytes": file_size
            })

    def generate_synthetic_frame(self):
        """Generates a high-tech synthetic drone FPV camera HUD frame."""
        self.synth_step += 1
        t = self.synth_step * 0.05

        # Background: dark horizon gradient
        img = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        img[:] = (18, 22, 28)

        # Ground vs Sky division with simulated gentle pitch/roll
        roll_angle = math.sin(t * 0.3) * 3.0  # degrees
        pitch_offset = int(math.sin(t * 0.2) * 30.0)  # pixels
        cy = self.height // 2 + pitch_offset
        cx = self.width // 2

        # Artificial horizon line
        cos_r = math.cos(math.radians(roll_angle))
        sin_r = math.sin(math.radians(roll_angle))
        h_len = 300
        x1 = int(cx - h_len * cos_r)
        y1 = int(cy - h_len * sin_r)
        x2 = int(cx + h_len * cos_r)
        y2 = int(cy + h_len * sin_r)
        cv2.line(img, (x1, y1), (x2, y2), (6, 182, 212), 2)  # Cyan horizon

        # Pitch ladder ticks
        for ladder_deg in [-10, -5, 5, 10]:
            ladder_y = cy - int(ladder_deg * 8)
            lx1 = int(cx - 35)
            lx2 = int(cx + 35)
            cv2.line(img, (lx1, ladder_y), (lx2, ladder_y), (148, 163, 184), 1)

        # Center crosshair reticle
        cv2.circle(img, (cx, cy), 18, (6, 182, 212), 1)
        cv2.circle(img, (cx, cy), 2, (6, 182, 212), -1)
        cv2.line(img, (cx - 28, cy), (cx - 10, cy), (6, 182, 212), 2)
        cv2.line(img, (cx + 10, cy), (cx + 28, cy), (6, 182, 212), 2)
        cv2.line(img, (cx, cy - 28), (cx, cy - 10), (6, 182, 212), 2)
        cv2.line(img, (cx, cy + 10), (cx, cy + 28), (6, 182, 212), 2)

        # Top Compass Heading Bar
        cv2.rectangle(img, (cx - 150, 20), (cx + 150, 50), (15, 23, 42), -1)
        cv2.rectangle(img, (cx - 150, 20), (cx + 150, 50), (56, 189, 248), 1)
        heading = int((t * 15) % 360)
        cv2.putText(img, f"HDG: {heading:03d} DEG", (cx - 65, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

        # Bottom Left: Telemetry & Ingest Status
        cv2.rectangle(img, (30, self.height - 85), (280, self.height - 25), (15, 23, 42), -1)
        cv2.rectangle(img, (30, self.height - 85), (280, self.height - 25), (71, 85, 105), 1)
        cv2.putText(img, "AALAAPI SKY LIVE CAST", (40, self.height - 65), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (6, 182, 212), 1)
        cv2.putText(img, f"SRC: {self.source} | 30 FPS", (40, self.height - 45), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (148, 163, 184), 1)
        cv2.putText(img, time.strftime("%Y-%m-%d %H:%M:%S"), (40, self.height - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (100, 116, 139), 1)

        # Top Right: Recording Indicator if armed
        if self.recording:
            dur = int(time.time() - self.record_start_time)
            mins = dur // 60
            secs = dur % 60
            # Pulsing red circle
            pulse = (math.sin(t * 6) + 1.0) / 2.0
            r_col = (0, 0, int(180 + 75 * pulse))
            cv2.circle(img, (self.width - 130, 35), 7, r_col, -1)
            cv2.putText(img, f"REC {mins:02d}:{secs:02d}", (self.width - 115, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (239, 68, 68), 2)
        else:
            cv2.circle(img, (self.width - 120, 35), 6, (16, 185, 129), -1)
            cv2.putText(img, "LIVE", (self.width - 105, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (16, 185, 129), 1)

        return img

    def run_stream_loop(self):
        target_interval = 1.0 / self.target_fps
        reconnect_time = 0

        while self.running:
            start_t = time.time()

            # Attempt capture from hardware/network if selected and not open
            if self.source != "test" and self.cap is None and OPENCV_AVAILABLE:
                if time.time() - reconnect_time >= 2.0:
                    reconnect_time = time.time()
                    self.cap = self.open_capture()

            frame = None
            if self.cap is not None and self.cap.isOpened():
                ret, frame = self.cap.read()
                if not ret or frame is None:
                    self.log("Stream dropped from source, auto-recovering in 2s...")
                    self.cap.release()
                    self.cap = None
                    reconnect_time = time.time()

            if frame is None:
                if OPENCV_AVAILABLE:
                    frame = self.generate_synthetic_frame()
                else:
                    # Pure fallback without opencv
                    time.sleep(target_interval)
                    continue

            # Concurrent recording write
            with self.lock:
                if self.recording and self.writer is not None:
                    try:
                        self.writer.write(frame)
                        self.record_frame_count += 1
                    except Exception as e:
                        self.log(f"Error writing frame to recorder: {e}")

            # JPEG Compression for WebSocket casting
            if OPENCV_AVAILABLE:
                ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), self.quality])
                if ret:
                    jpeg_bytes = jpeg.tobytes()
                    # 4-byte big-endian length prefix followed by raw JPEG bytes
                    payload_len = len(jpeg_bytes)
                    try:
                        sys.stdout.buffer.write(payload_len.to_bytes(4, byteorder='big'))
                        sys.stdout.buffer.write(jpeg_bytes)
                        sys.stdout.buffer.flush()
                    except (IOError, BrokenPipeError):
                        # Node process closed pipe
                        break

            # Frame rate pacing
            elapsed = time.time() - start_t
            sleep_t = target_interval - elapsed
            if sleep_t > 0:
                time.sleep(sleep_t)

        # Cleanup on exit
        if self.cap:
            try:
                self.cap.release()
            except Exception:
                pass
        if self.writer:
            try:
                self.writer.release()
            except Exception:
                pass

    def handle_stdin(self):
        while self.running:
            line = sys.stdin.readline()
            if not line:
                self.running = False
                break
            line = line.strip()
            if not line:
                continue

            try:
                cmd = json.loads(line)
                action = cmd.get("cmd")
                if action == "set_source":
                    self.set_source(cmd.get("source", "test"))
                elif action == "start_record":
                    self.start_recording(cmd.get("filePath"))
                elif action == "stop_record":
                    self.stop_recording()
                elif action == "status":
                    self.send_status()
                elif action == "quit":
                    self.running = False
                    break
            except Exception as e:
                self.log(f"Error processing command {line}: {e}")


def main():
    worker = VideoWorker()
    worker.send_status({"event": "ready", "opencv": OPENCV_AVAILABLE})

    # Start command reader thread
    stdin_thread = threading.Thread(target=worker.handle_stdin, daemon=True)
    stdin_thread.start()

    # Run stream loop on main thread
    try:
        worker.run_stream_loop()
    except KeyboardInterrupt:
        pass
    finally:
        worker.running = False
        if worker.recording:
            worker.stop_recording()


if __name__ == "__main__":
    main()
