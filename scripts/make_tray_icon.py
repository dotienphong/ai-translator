"""Tạo icon khay tạm cho macOS: `src-tauri/icons/tray-template.png`, 44×44 (22 pt ở màn hình @2x).

Icon dạng template: chỉ dùng kênh alpha, màu đen; macOS tự đổi màu theo menu bar sáng hay tối.
Hình: khung phụ đề bo góc với hai dòng chữ. Logo thật chưa chốt (Q1).

Dùng:  python3 scripts/make_tray_icon.py
Chỉ dùng thư viện chuẩn của Python.
"""
import struct
import zlib

SIZE = 44
SUB = 4  # lấy mẫu 4×4 mỗi pixel để khử răng cưa


def inside_round_rect(x, y, left, top, right, bottom, radius):
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius**2 and left <= x <= right and top <= y <= bottom


def covered(x, y):
    # Viền khung: phần giữa hai hình chữ nhật bo góc.
    outer = inside_round_rect(x, y, 3, 7, 41, 37, 7)
    inner = inside_round_rect(x, y, 6.5, 10.5, 37.5, 33.5, 4)
    if outer and not inner:
        return True
    # Hai dòng chữ.
    return inside_round_rect(x, y, 11, 16, 33, 19.5, 1.75) or inside_round_rect(x, y, 11, 24.5, 27, 28, 1.75)


def chunk(tag, data):
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def main():
    rows = []
    for py in range(SIZE):
        row = bytearray([0])  # bộ lọc "None" cho mỗi hàng
        for px in range(SIZE):
            hits = sum(
                covered(px + (i + 0.5) / SUB, py + (j + 0.5) / SUB) for i in range(SUB) for j in range(SUB)
            )
            row += bytes((0, 0, 0, round(255 * hits / (SUB * SUB))))
        rows.append(bytes(row))
    header = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)  # 8 bit mỗi kênh, RGBA
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
           + chunk(b"IEND", b""))
    with open("src-tauri/icons/tray-template.png", "wb") as f:
        f.write(png)


if __name__ == "__main__":
    main()
