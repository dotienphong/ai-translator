"""Tạo icon tạm 1024×1024 (PNG, hình tròn xanh trên nền trong suốt) cho spike S5.

Dùng:  python3 scripts/make_icon.py && pnpm tauri icon app-icon.png
Chỉ dùng thư viện chuẩn của Python. Tên và logo thật chưa chốt (spec §15).
"""
import struct
import zlib

SIZE = 1024
RADIUS = SIZE * 0.42
BLUE = bytes((32, 110, 200, 255))
CLEAR = bytes((0, 0, 0, 0))


def chunk(tag, data):
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def main():
    rows = []
    for y in range(SIZE):
        row = bytearray([0])  # bộ lọc "None" cho mỗi hàng
        for x in range(SIZE):
            inside = (x - SIZE / 2) ** 2 + (y - SIZE / 2) ** 2 < RADIUS**2
            row += BLUE if inside else CLEAR
        rows.append(bytes(row))
    header = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)  # 8 bit mỗi kênh, RGBA
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
           + chunk(b"IEND", b""))
    with open("app-icon.png", "wb") as f:
        f.write(png)


if __name__ == "__main__":
    main()
