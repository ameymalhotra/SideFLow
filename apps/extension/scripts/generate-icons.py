#!/usr/bin/env python3
"""
Generate extension icons: disconnected (red) and connected (green) circles
with a thin outline ring. Outputs to public/icon/ as icon-{size}.png and
icon-connected-{size}.png for sizes 16, 32, 48, 128.
"""
import struct
import zlib
import math
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ICON_DIR = os.path.join(SCRIPT_DIR, "..", "public", "icon")


def create_png(width: int, height: int, pixels: list[int]) -> bytes:
    def chunk(ctype: bytes, data: bytes) -> bytes:
        c = ctype + data
        return struct.pack(">I", len(data)) + c + struct.pack(
            ">I", zlib.crc32(c) & 0xFFFFFFFF
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(
        b"IHDR",
        struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0),
    )

    raw = b""
    for y in range(height):
        raw += b"\x00"
        for x in range(width):
            idx = (y * width + x) * 4
            raw += bytes(pixels[idx : idx + 4])

    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


def draw_circle_icon(size: int, r: int, g: int, b: int) -> bytes:
    pixels = [0] * (size * size * 4)
    cx = cy = size / 2.0
    radius = size * 0.42
    # Thin outline ring (outer and inner edge)
    ring_width = max(1.0, size * 0.06)
    inner = radius - ring_width
    # Slight outer glow for the ring
    outer = radius + 1.2

    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            dx = x + 0.5 - cx
            dy = y + 0.5 - cy
            dist = math.sqrt(dx * dx + dy * dy)

            if dist <= inner:
                pixels[idx] = r
                pixels[idx + 1] = g
                pixels[idx + 2] = b
                pixels[idx + 3] = 255
            elif dist <= radius:
                # Ring: slightly darker
                t = (radius - dist) / ring_width
                t = max(0, min(1, t))
                br = int(r * 0.7)
                bg = int(g * 0.7)
                bb = int(b * 0.7)
                pixels[idx] = int(r * t + br * (1 - t))
                pixels[idx + 1] = int(g * t + bg * (1 - t))
                pixels[idx + 2] = int(b * t + bb * (1 - t))
                pixels[idx + 3] = 255
            elif dist <= outer:
                # Anti-aliased outer edge of ring
                t = max(0, min(1, (outer - dist) / 1.2))
                br = int(r * 0.6)
                bg = int(g * 0.6)
                bb = int(b * 0.6)
                pixels[idx] = br
                pixels[idx + 1] = bg
                pixels[idx + 2] = bb
                pixels[idx + 3] = int(220 * t)

    return create_png(size, size, pixels)


def main() -> None:
    os.makedirs(ICON_DIR, exist_ok=True)

    for size in [16, 32, 48, 128]:
        # Disconnected: red (#E53935)
        png = draw_circle_icon(size, 229, 57, 53)
        path = os.path.join(ICON_DIR, f"icon-{size}.png")
        with open(path, "wb") as f:
            f.write(png)
        print(f"  {path}: {len(png)} bytes")

        # Connected: green (#43A047)
        png = draw_circle_icon(size, 67, 160, 71)
        path = os.path.join(ICON_DIR, f"icon-connected-{size}.png")
        with open(path, "wb") as f:
            f.write(png)
        print(f"  {path}: {len(png)} bytes")

    print("Done.")


if __name__ == "__main__":
    main()
