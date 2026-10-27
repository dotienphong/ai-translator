"""Tải model nhúng giọng ERes2Net (3D-Speaker, Apache-2.0) bản ONNX của sherpa-onnx, rút gọn đồ thị bằng onnxsim để
candle-onnx chạy được (spec 2026-10-26-phan-biet-nguoi-noi §4.5, §5.1), ghi SHA-256 và LICENSE.

python -I prepare_model.py <thư mục ra>
"""
import hashlib
import os
import sys
import urllib.request

import onnx
import onnxsim

URL = ("https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/"
       "3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx")
SHA_GOC = "c59158379255ad66e161679cca6af8d52d51e389e3224ab7d7a7baae295c2db5"
LICENSE_URL = "https://raw.githubusercontent.com/modelscope/3D-Speaker/main/LICENSE"
TEN = "eres2net-sv-en-voxceleb-16k"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    goc = os.path.join(out, TEN + ".orig.onnx")
    if not os.path.exists(goc):
        urllib.request.urlretrieve(URL, goc)
    assert sha256(goc) == SHA_GOC, "SHA-256 của file tải về không khớp"
    m, ok = onnxsim.simplify(onnx.load(goc))
    assert ok, "onnxsim không kiểm được đồ thị đã rút gọn"
    names = ([i.name for i in m.graph.input], [o.name for o in m.graph.output])
    assert names == (["x"], ["embedding"]), names
    dich = os.path.join(out, TEN + ".onnx")
    onnx.save(m, dich)
    urllib.request.urlretrieve(LICENSE_URL, os.path.join(out, TEN + "-LICENSE.txt"))
    print(f"{dich}\n  sha256 {sha256(dich)}\n  {os.path.getsize(dich)} byte")


if __name__ == "__main__":
    main()
