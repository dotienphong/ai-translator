"""S6 trên Windows: VRAM lớn nhất của từng tiến trình, từ file CSV của vram-sample.ps1.

Dùng:  python bench\\phase0\\latency\\vram_peak.py bench\\phase0\\results\\latency\\vram-<nhãn>.csv [...]
"""
import csv
import sys
from collections import defaultdict


def main():
    print("| File | Tiến trình | VRAM riêng lớn nhất (MB) | Bộ nhớ dùng chung lớn nhất (MB) |")
    print("|---|---|---|---|")
    for path in sys.argv[1:]:
        dedicated, shared = defaultdict(float), defaultdict(float)
        # Windows PowerShell 5.1 ghi UTF-8 có BOM.
        with open(path, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                name = row["process"]
                dedicated[name] = max(dedicated[name], float(row["dedicated_mb"]))
                shared[name] = max(shared[name], float(row["shared_mb"]))
        for name in sorted(dedicated):
            print(f"| {path} | {name} | {dedicated[name]:.0f} | {shared[name]:.0f} |")


if __name__ == "__main__":
    main()
