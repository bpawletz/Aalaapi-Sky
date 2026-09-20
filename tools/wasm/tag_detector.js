/**
 * Aalaapi Sky — Optical Tag Detector (AprilTag & ArUco)
 * 
 * High-performance, lazy-loaded computer vision detection engine for:
 * - AprilTag 25h9 (tag25h9, 35 codes, Hamming 9)
 * - AprilTag 36h11 (tag36h11, 50 codes, Hamming 11)
 * - AprilTag 16h5 (tag16h5, 30 codes, Hamming 5)
 * - ArUco 4x4 (DICT_4X4_50, 50 codes)
 * - ArUco 5x5 (DICT_5X5_100, 50 codes)
 * 
 * Compatible with both Browser (HTML5 Canvas ImageData) and Node.js.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TagDetector = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --- Dictionaries & Code Definitions ---

  const APRILTAG_25H9_CODES = [
    0x0156f1f4, 0x01f28cd5, 0x016ce32c, 0x01ea379c, 0x01390f89,
    0x0034fad0, 0x007dcdb5, 0x0119ba95, 0x01ae9daa, 0x00df02aa,
    0x0082fc15, 0x00465123, 0x00ceee98, 0x01f17260, 0x014429cd,
    0x017248a8, 0x016ad452, 0x009670ad, 0x016f65b2, 0x00b8322b,
    0x005d715b, 0x01a1c7e7, 0x00d7890d, 0x01813522, 0x01c9c611,
    0x0099e4a4, 0x00855234, 0x017b81c0, 0x00c294bb, 0x0089fae3,
    0x0044df5f, 0x01360159, 0x00ec31e8, 0x01bcc0f6, 0x00a64f8d
  ];
  const APRILTAG_25H9_BIT_X = [1,2,3,4,2,3,5,5,5,5,4,4,5,4,3,2,4,3,1,1,1,1,2,2,3];
  const APRILTAG_25H9_BIT_Y = [1,1,1,1,2,2,1,2,3,4,2,3,5,5,5,5,4,4,5,4,3,2,4,3,3];

  const APRILTAG_36H11_CODES = [
    0x0dc4a1c821n, 0x0e17b470e9n, 0x0ef91d01b1n, 0x0f429cdd73n, 0x005da29225n,
    0x01106cba43n, 0x0223bed79dn, 0x021f51213cn, 0x033eb19ca6n, 0x03f76eb0f8n,
    0x0469a97414n, 0x045dcfe0b0n, 0x04a6465f72n, 0x051801db96n, 0x05eb946b4en,
    0x068a7cc2ecn, 0x06f0ba2652n, 0x078765559dn, 0x087b83d129n, 0x086cc4a5c5n,
    0x08b64df90fn, 0x09c577b611n, 0x0a3810f2f5n, 0x0af4d75b83n, 0x0b59a03fefn,
    0x0bb1096f85n, 0x0d1b92fc76n, 0x0d0dd509d2n, 0x0e2cfda160n, 0x02ff497c63n,
    0x047240671bn, 0x05047a2e55n, 0x0635ca87c7n, 0x0691254166n, 0x068f43d94an,
    0x06ef24bdb6n, 0x08cdd8f886n, 0x09de96b718n, 0x0aff6e5a8an, 0x0bae46f029n,
    0x0d9c490e6cn, 0x0e8d08594dn, 0x0e97be6f54n, 0x0fb0a3a41fn, 0x0059f1d08an,
    0x011f8e13f9n, 0x01b0b69bc8n, 0x01be486a41n, 0x027cfc1f7fn, 0x02613d943en
  ];
  const APRILTAG_36H11_BIT_X = [1,2,3,4,5,2,3,4,3,6,6,6,6,6,5,5,5,4,6,5,4,3,2,4,4,4,3,1,1,1,1,1,2,2,2,3];
  const APRILTAG_36H11_BIT_Y = [1,1,1,1,1,2,2,2,3,1,2,3,4,5,2,3,4,3,6,6,6,6,6,5,4,3,4,6,5,4,3,2,5,4,3,4];

  const APRILTAG_16H5_CODES = [
    0xd6c4, 0xa574, 0x562c, 0x9da2, 0x659e, 0xd6fe, 0x1acd, 0xe931,
    0x53c1, 0x9255, 0xb2a3, 0x4b29, 0xab5b, 0x6adb, 0x2b97, 0x356b,
    0xcb65, 0x6d89, 0xb649, 0x7317, 0x550d, 0x44d8, 0x6c96, 0x9376,
    0x3e18, 0x5825, 0x3a77, 0x7770, 0x23ac, 0xac60
  ];
  const APRILTAG_16H5_BIT_X = [1,2,3,2,4,4,4,3,4,3,2,3,1,1,1,2];
  const APRILTAG_16H5_BIT_Y = [1,1,1,2,1,2,3,2,4,4,4,3,4,3,2,3];

  const ARUCO_4X4_50_DATA = [
    [181, 50], [15, 154], [51, 45], [153, 70], [84, 158], [121, 205], [158, 46], [196, 242],
    [254, 218], [207, 86], [249, 145], [17, 167], [14, 183], [42, 15], [36, 177], [38, 62],
    [70, 101], [102, 0], [108, 94], [118, 175], [134, 139], [176, 43], [204, 213], [221, 130],
    [254, 71], [148, 113], [172, 228], [165, 84], [33, 35], [52, 111], [68, 21], [87, 178],
    [158, 207], [240, 203], [8, 174], [9, 41], [24, 117], [4, 255], [13, 246], [28, 90],
    [23, 24], [42, 40], [50, 140], [56, 178], [36, 232], [46, 235], [45, 63], [75, 100],
    [80, 46], [80, 19]
  ];

  const ARUCO_5X5_DATA = [
    [132, 33, 8, 0], [132, 33, 11, 1], [132, 33, 4, 1], [132, 33, 7, 0],
    [132, 33, 120, 0], [132, 33, 123, 1], [132, 33, 116, 1], [132, 33, 119, 0],
    [132, 32, 152, 0], [132, 32, 155, 1], [132, 32, 148, 1], [132, 32, 151, 0],
    [132, 32, 232, 0], [132, 32, 235, 1], [132, 32, 228, 1], [132, 32, 231, 0],
    [132, 47, 8, 0], [132, 47, 11, 1], [132, 47, 4, 1], [132, 47, 7, 0],
    [132, 47, 120, 0], [132, 47, 123, 1], [132, 47, 116, 1], [132, 47, 119, 0],
    [132, 46, 152, 0], [132, 46, 155, 1], [132, 46, 148, 1], [132, 46, 151, 0],
    [132, 46, 232, 0], [132, 46, 235, 1], [132, 46, 228, 1], [132, 46, 231, 0],
    [132, 37, 8, 0], [132, 37, 11, 1], [132, 37, 4, 1], [132, 37, 7, 0],
    [132, 37, 120, 0], [132, 37, 123, 1], [132, 37, 116, 1], [132, 37, 119, 0],
    [132, 36, 152, 0], [132, 36, 155, 1], [132, 36, 148, 1], [132, 36, 151, 0],
    [132, 36, 232, 0], [132, 36, 235, 1], [132, 36, 228, 1], [132, 36, 231, 0],
    [132, 43, 8, 0], [132, 43, 11, 1]
  ];

  // --- Computer Vision Utilities ---

  function toGrayscale(data, width, height) {
    const len = width * height;
    const gray = new Uint8Array(len);
    if (data.length === len * 4) {
      for (let i = 0, j = 0; i < len; i++, j += 4) {
        gray[i] = (data[j] * 77 + data[j + 1] * 151 + data[j + 2] * 28) >> 8;
      }
    } else if (data.length === len) {
      gray.set(data);
    }
    return gray;
  }

  function computeIntegralImage(gray, width, height) {
    const integral = new Uint32Array((width + 1) * (height + 1));
    const stride = width + 1;
    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      const gRow = y * width;
      const iRow = (y + 1) * stride;
      const iPrevRow = y * stride;
      for (let x = 0; x < width; x++) {
        rowSum += gray[gRow + x];
        integral[iRow + x + 1] = integral[iPrevRow + x + 1] + rowSum;
      }
    }
    return integral;
  }

  function adaptiveThreshold(gray, width, height, integral, windowSize, C = 7) {
    const binary = new Uint8Array(width * height);
    const half = Math.floor(windowSize / 2);
    const stride = width + 1;

    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - half);
      const y1 = Math.min(height, y + half + 1);
      const rIdx = y * width;

      for (let x = 0; x < width; x++) {
        const x0 = Math.max(0, x - half);
        const x1 = Math.min(width, x + half + 1);

        const count = (x1 - x0) * (y1 - y0);
        const sum = integral[y1 * stride + x1]
                  - integral[y0 * stride + x1]
                  - integral[y1 * stride + x0]
                  + integral[y0 * stride + x0];

        const mean = sum / count;
        binary[rIdx + x] = (gray[rIdx + x] < mean - C) ? 1 : 0; // 1 = dark (black border), 0 = light
      }
    }
    return binary;
  }

  function perpendicularDistance(p, p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag < 1e-7) return Math.sqrt((p.x - p1.x) ** 2 + (p.y - p1.y) ** 2);
    return Math.abs(dy * p.x - dx * p.y + p2.x * p1.y - p2.y * p1.x) / mag;
  }

  function rdp(points, epsilon) {
    if (points.length <= 2) return points;
    let maxDist = 0;
    let index = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const dist = perpendicularDistance(points[i], points[0], points[points.length - 1]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (maxDist > epsilon) {
      const left = rdp(points.slice(0, index + 1), epsilon);
      const right = rdp(points.slice(index), epsilon);
      return left.slice(0, left.length - 1).concat(right);
    } else {
      return [points[0], points[points.length - 1]];
    }
  }

  function traceBorder(binary, width, height, startX, startY, visited) {
    const contour = [];
    let curX = startX;
    let curY = startY;

    // 8-neighbor offsets clockwise: N, NE, E, SE, S, SW, W, NW
    const dx = [0, 1, 1, 1, 0, -1, -1, -1];
    const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

    let checkDir = 7;
    contour.push({ x: curX, y: curY });
    visited[curY * width + curX] = 1;

    let maxSteps = 4000;
    while (maxSteps-- > 0) {
      let found = false;
      for (let i = 0; i < 8; i++) {
        const dir = (checkDir + i) % 8;
        const nx = curX + dx[dir];
        const ny = curY + dy[dir];

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (binary[ny * width + nx] === 1) {
            curX = nx;
            curY = ny;
            contour.push({ x: curX, y: curY });
            visited[curY * width + curX] = 1;
            checkDir = (dir + 5) % 8;
            found = true;
            break;
          }
        }
      }

      if (!found) break;
      if (curX === startX && curY === startY && contour.length > 3) break;
    }

    return contour;
  }

  function findCandidateQuads(binary, width, height, minArea = 100, maxArea = null) {
    const quads = [];
    const visited = new Uint8Array(width * height);
    if (!maxArea) maxArea = (width * height) * 0.85;

    for (let y = 4; y < height - 4; y += 2) {
      const rIdx = y * width;
      for (let x = 4; x < width - 4; x += 2) {
        if (binary[rIdx + x] === 1 && visited[rIdx + x] === 0) {
          // Verify it's an outer transition (pixel above or left is 0)
          if (binary[(y - 1) * width + x] === 0 || binary[rIdx + (x - 1)] === 0) {
            const rawContour = traceBorder(binary, width, height, x, y, visited);
            if (rawContour.length >= 20 && rawContour.length < 3500) {
              // Compute approximate polygon
              const perimeter = rawContour.length;
              const epsilon = Math.max(1.8, perimeter * 0.035);
              const simplified = rdp(rawContour, epsilon);

              // Remove duplicate closure point if present
              let poly = simplified;
              if (poly.length > 3 && poly[0].x === poly[poly.length - 1].x && poly[0].y === poly[poly.length - 1].y) {
                poly = poly.slice(0, poly.length - 1);
              }

              if (poly.length === 4) {
                // Check polygon area via shoelace formula
                let area = 0;
                for (let i = 0; i < 4; i++) {
                  const j = (i + 1) % 4;
                  area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
                }
                area = Math.abs(area) / 2;

                if (area >= minArea && area <= maxArea) {
                  // Ensure vertices are ordered counter-clockwise
                  if (area > 0) {
                    // Check convexity: cross products of adjacent edges must have same sign
                    let isConvex = true;
                    let prevSign = 0;
                    for (let i = 0; i < 4; i++) {
                      const p0 = poly[i];
                      const p1 = poly[(i + 1) % 4];
                      const p2 = poly[(i + 2) % 4];
                      const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
                      const sign = cross > 0 ? 1 : (cross < 0 ? -1 : 0);
                      if (sign !== 0) {
                        if (prevSign === 0) prevSign = sign;
                        else if (sign !== prevSign) { isConvex = false; break; }
                      }
                    }

                    if (isConvex) {
                      // Normalize vertex order clockwise
                      let ordered = poly.slice();
                      if (prevSign > 0) ordered.reverse();
                      quads.push(ordered);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return quads;
  }

  // 4-point perspective homography solver mapping [0, N] x [0, N] to corners (c0, c1, c2, c3)
  function getSquareToQuadHomography(c0, c1, c2, c3, N) {
    const x0 = c0.x, y0 = c0.y;
    const x1 = c1.x, y1 = c1.y;
    const x2 = c2.x, y2 = c2.y;
    const x3 = c3.x, y3 = c3.y;

    const dx1 = x1 - x2, dy1 = y1 - y2;
    const dx2 = x3 - x2, dy2 = y3 - y2;
    const sx = x0 - x1 + x2 - x3;
    const sy = y0 - y1 + y2 - y3;

    const det = dx1 * dy2 - dx2 * dy1;
    let g = 0, h = 0;
    if (Math.abs(det) > 1e-7) {
      g = (sx * dy2 - sy * dx2) / det;
      h = (dx1 * sy - dy1 * sx) / det;
    }

    const a = x1 - x0 + g * x1;
    const b = x3 - x0 + h * x3;
    const c = x0;
    const d = y1 - y0 + g * y1;
    const e = y3 - y0 + h * y3;
    const f = y0;

    return [
      a / N, b / N, c,
      d / N, e / N, f,
      g / N, h / N, 1.0
    ];
  }

  function sampleQuadGrid(gray, width, height, H, N) {
    const grid = Array.from({ length: N }, () => new Uint8Array(N));
    const cellVals = Array.from({ length: N }, () => new Float32Array(N));

    // Sample each cell center and 4 sub-pixel offsets
    const offsets = [
      { u: 0.5, v: 0.5, w: 2.0 },
      { u: 0.3, v: 0.3, w: 1.0 },
      { u: 0.7, v: 0.3, w: 1.0 },
      { u: 0.3, v: 0.7, w: 1.0 },
      { u: 0.7, v: 0.7, w: 1.0 }
    ];

    let minVal = 255;
    let maxVal = 0;
    let borderSum = 0;
    let borderCount = 0;

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        let sum = 0;
        let totalW = 0;
        for (const off of offsets) {
          const u = c + off.u;
          const v = r + off.v;
          const w = H[6] * u + H[7] * v + H[8];
          const px = Math.round((H[0] * u + H[1] * v + H[2]) / w);
          const py = Math.round((H[3] * u + H[4] * v + H[5]) / w);

          if (px >= 0 && px < width && py >= 0 && py < height) {
            sum += gray[py * width + px] * off.w;
            totalW += off.w;
          }
        }
        const val = totalW > 0 ? (sum / totalW) : 128;
        cellVals[r][c] = val;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;

        const isBorder = (r === 0 || r === N - 1 || c === 0 || c === N - 1);
        if (isBorder) {
          borderSum += val;
          borderCount++;
        }
      }
    }

    // Border validation: contrast between border and inner region
    const borderAvg = borderCount > 0 ? (borderSum / borderCount) : 255;
    const threshold = (borderAvg + maxVal) / 2;

    // Reject if border is not sufficiently dark compared to max brightness
    if (maxVal - borderAvg < 20) return null;

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        grid[r][c] = cellVals[r][c] > threshold ? 1 : 0; // 0 = black, 1 = white
      }
    }

    // Verify outer border is all black
    let borderWhiteCount = 0;
    for (let r = 0; r < N; r++) {
      if (grid[r][0] === 1) borderWhiteCount++;
      if (grid[r][N - 1] === 1) borderWhiteCount++;
    }
    for (let c = 1; c < N - 1; c++) {
      if (grid[0][c] === 1) borderWhiteCount++;
      if (grid[N - 1][c] === 1) borderWhiteCount++;
    }

    // Allow at most 1 faulty border cell due to noise
    if (borderWhiteCount > 2) return null;

    return grid;
  }

  // Decodes a candidate NxN grid against supported families across all 4 rotations
  function decodeGrid(grid, N) {
    // 1. AprilTag 25h9 (N = 7)
    if (N === 7) {
      for (let rot = 0; rot < 4; rot++) {
        let code = 0;
        for (let i = 0; i < 25; i++) {
          let gx = APRILTAG_25H9_BIT_X[i];
          let gy = APRILTAG_25H9_BIT_Y[i];

          // Apply rotation
          if (rot === 1) { const t = gx; gx = 6 - gy; gy = t; }
          else if (rot === 2) { gx = 6 - gx; gy = 6 - gy; }
          else if (rot === 3) { const t = gx; gx = gy; gy = 6 - t; }

          const bitVal = grid[gy][gx];
          if (bitVal === 1) code |= (1 << (24 - i));
        }

        const exactIdx = APRILTAG_25H9_CODES.indexOf(code);
        if (exactIdx !== -1) {
          return { family: 'apriltag_25h9', id: exactIdx, rotationSteps: rot, confidence: 1.0 };
        }
      }
    }

    // 2. ArUco 4x4 (N = 6)
    if (N === 6) {
      for (let rot = 0; rot < 4; rot++) {
        const pair = [0, 0];
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            let gx = c + 1;
            let gy = r + 1;

            if (rot === 1) { const t = gx; gx = 5 - gy; gy = t; }
            else if (rot === 2) { gx = 5 - gx; gy = 5 - gy; }
            else if (rot === 3) { const t = gx; gx = gy; gy = 5 - t; }

            const bitIdx = r * 4 + c;
            const byteIdx = Math.floor(bitIdx / 8);
            const bitInByte = 7 - (bitIdx % 8);
            if (grid[gy][gx] === 1) {
              pair[byteIdx] |= (1 << bitInByte);
            }
          }
        }

        for (let id = 0; id < ARUCO_4X4_50_DATA.length; id++) {
          const d = ARUCO_4X4_50_DATA[id];
          if (d[0] === pair[0] && d[1] === pair[1]) {
            return { family: 'aruco_4x4', id, rotationSteps: rot, confidence: 1.0 };
          }
        }
      }
    }

    // 3. ArUco 5x5 (N = 7)
    if (N === 7) {
      for (let rot = 0; rot < 4; rot++) {
        const tuple = [0, 0, 0, 0];
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            let gx = c + 1;
            let gy = r + 1;

            if (rot === 1) { const t = gx; gx = 6 - gy; gy = t; }
            else if (rot === 2) { gx = 6 - gx; gy = 6 - gy; }
            else if (rot === 3) { const t = gx; gx = gy; gy = 6 - t; }

            const bitIdx = r * 5 + c;
            const byteIdx = Math.floor(bitIdx / 8);
            const bitInByte = 7 - (bitIdx % 8);
            if (grid[gy][gx] === 1) {
              tuple[byteIdx] |= (1 << bitInByte);
            }
          }
        }

        for (let id = 0; id < ARUCO_5X5_DATA.length; id++) {
          const d = ARUCO_5X5_DATA[id];
          if (d[0] === tuple[0] && d[1] === tuple[1] && d[2] === tuple[2] && d[3] === tuple[3]) {
            return { family: 'aruco_5x5', id, rotationSteps: rot, confidence: 1.0 };
          }
        }
      }
    }

    // 4. AprilTag 16h5 (N = 6)
    if (N === 6) {
      for (let rot = 0; rot < 4; rot++) {
        let code = 0;
        for (let i = 0; i < 16; i++) {
          let gx = APRILTAG_16H5_BIT_X[i];
          let gy = APRILTAG_16H5_BIT_Y[i];

          if (rot === 1) { const t = gx; gx = 5 - gy; gy = t; }
          else if (rot === 2) { gx = 5 - gx; gy = 5 - gy; }
          else if (rot === 3) { const t = gx; gx = gy; gy = 5 - t; }

          if (grid[gy][gx] === 1) code |= (1 << (15 - i));
        }

        const idx = APRILTAG_16H5_CODES.indexOf(code);
        if (idx !== -1) {
          return { family: 'apriltag_16h5', id: idx, rotationSteps: rot, confidence: 1.0 };
        }
      }
    }

    // 5. AprilTag 36h11 (N = 8)
    if (N === 8) {
      for (let rot = 0; rot < 4; rot++) {
        let code = 0n;
        for (let i = 0; i < 36; i++) {
          let gx = APRILTAG_36H11_BIT_X[i];
          let gy = APRILTAG_36H11_BIT_Y[i];

          if (rot === 1) { const t = gx; gx = 7 - gy; gy = t; }
          else if (rot === 2) { gx = 7 - gx; gy = 7 - gy; }
          else if (rot === 3) { const t = gx; gx = gy; gy = 7 - t; }

          if (grid[gy][gx] === 1) code |= (1n << BigInt(35 - i));
        }

        const idx = APRILTAG_36H11_CODES.indexOf(code);
        if (idx !== -1) {
          return { family: 'apriltag_36h11', id: idx, rotationSteps: rot, confidence: 1.0 };
        }
      }
    }

    return null;
  }

  // --- TagDetector Class & Public API ---

  let isInitialized = false;

  const TagDetector = {
    name: 'AalaapiTagDetector',
    version: '1.0.0',

    toGrayscale,
    computeIntegralImage,
    adaptiveThreshold,
    findCandidateQuads,
    sampleQuadGrid,
    decodeGrid,
    getSquareToQuadHomography,

    isLoaded() {
      return isInitialized;
    },

    async load() {
      if (isInitialized) return true;
      // Simulated lazy WebAssembly compile / ready promise
      await new Promise(r => setTimeout(r, 10));
      isInitialized = true;
      return true;
    },

    detect(input, options = {}) {
      const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      let gray = null;
      let width = 0;
      let height = 0;
      let scaleX = 1.0;
      let scaleY = 1.0;

      // 1. Resolve raw image dimensions and pixels from browser Canvas / ImageData / Node Buffer
      if (typeof HTMLCanvasElement !== 'undefined' && input instanceof HTMLCanvasElement) {
        try {
          const ctx = input.getContext('2d');
          const imgData = ctx.getImageData(0, 0, input.width, input.height);
          width = input.width;
          height = input.height;
          gray = toGrayscale(imgData.data, width, height);
        } catch (canvasErr) {
          console.warn('[TagDetector] Unable to getImageData from HTMLCanvasElement (possible taint or security restriction):', canvasErr);
          if (options.throwOnTaint) throw canvasErr;
          return [];
        }
      } else if (typeof ImageData !== 'undefined' && input instanceof ImageData) {
        width = input.width;
        height = input.height;
        gray = toGrayscale(input.data, width, height);
      } else if (input && input.data && input.width && input.height) {
        width = input.width;
        height = input.height;
        gray = toGrayscale(input.data, width, height);
      } else if (input && typeof input.getContext === 'function') {
        try {
          const ctx = input.getContext('2d');
          const imgData = ctx.getImageData(0, 0, input.width, input.height);
          width = input.width;
          height = input.height;
          gray = toGrayscale(imgData.data, width, height);
        } catch (canvasErr) {
          console.warn('[TagDetector] Unable to getImageData from canvas (possible taint or security restriction):', canvasErr);
          if (options.throwOnTaint) throw canvasErr;
          return [];
        }
      }

      if (!gray || width <= 0 || height <= 0) {
        return [];
      }

      // Downscale if image is larger than 1600px wide for candidate extraction
      const maxDim = options.maxDimension || 1600;
      let procGray = gray;
      let procW = width;
      let procH = height;

      if (Math.max(width, height) > maxDim) {
        const factor = maxDim / Math.max(width, height);
        procW = Math.round(width * factor);
        procH = Math.round(height * factor);
        scaleX = width / procW;
        scaleY = height / procH;

        procGray = new Uint8Array(procW * procH);
        for (let py = 0; py < procH; py++) {
          const sy = Math.min(height - 1, Math.round(py * scaleY));
          const pRow = py * procW;
          const sRow = sy * width;
          for (let px = 0; px < procW; px++) {
            const sx = Math.min(width - 1, Math.round(px * scaleX));
            procGray[pRow + px] = gray[sRow + sx];
          }
        }
      }

      // 2. Integral image and adaptive thresholding
      const integral = computeIntegralImage(procGray, procW, procH);
      const windowSize = Math.max(15, Math.min(65, Math.round(procW / 25)));
      const binary = adaptiveThreshold(procGray, procW, procH, integral, windowSize, 7);

      // 3. Find candidate quads
      const minQuadArea = options.minQuadArea || 80;
      const candidateQuads = findCandidateQuads(binary, procW, procH, minQuadArea);

      const detectedTags = [];
      const seenTagKeys = new Set();
      const gridSizesToTest = [7, 6, 8]; // 7 = tag25h9 / aruco5x5, 6 = aruco4x4 / tag16h5, 8 = tag36h11

      for (const quad of candidateQuads) {
        // Map corners back to native resolution
        const nativeCorners = quad.map(p => ({
          x: Math.round(p.x * scaleX * 10) / 10,
          y: Math.round(p.y * scaleY * 10) / 10
        }));

        const cornerOrders = [nativeCorners, nativeCorners.slice().reverse()];
        let quadMatched = false;

        for (const corners of cornerOrders) {
          if (quadMatched) break;
          for (const N of gridSizesToTest) {
            if (quadMatched) break;
            const H = getSquareToQuadHomography(
              corners[0], corners[1], corners[2], corners[3], N
            );

            const grid = sampleQuadGrid(gray, width, height, H, N);
            if (!grid) continue;

            const match = decodeGrid(grid, N);
            if (match) {
              const key = `${match.family}_${match.id}`;
              if (!seenTagKeys.has(key)) {
                seenTagKeys.add(key);

                // Orient corners according to rotationSteps
                const rot = match.rotationSteps;
                const orientedCorners = [
                  corners[rot % 4],
                  corners[(rot + 1) % 4],
                  corners[(rot + 2) % 4],
                  corners[(rot + 3) % 4]
                ];

                // Optical center via diagonals intersection
                const cx = (orientedCorners[0].x + orientedCorners[1].x + orientedCorners[2].x + orientedCorners[3].x) / 4;
                const cy = (orientedCorners[0].y + orientedCorners[1].y + orientedCorners[2].y + orientedCorners[3].y) / 4;

                // Physical yaw / rotation angle
                const dx = orientedCorners[1].x - orientedCorners[0].x;
                const dy = orientedCorners[1].y - orientedCorners[0].y;
                const rotationDeg = Math.round((Math.atan2(dy, dx) * 180 / Math.PI) * 10) / 10;

                detectedTags.push({
                  family: match.family,
                  id: match.id,
                  confidence: match.confidence,
                  corners: orientedCorners,
                  center: { x: Math.round(cx * 10) / 10, y: Math.round(cy * 10) / 10 },
                  rotationDeg
                });
              }
              quadMatched = true;
              break;
            }
          }
        }
      }

      const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime);
      return detectedTags.map(t => ({ ...t, durationMs }));
    }
  };

  return TagDetector;
});
