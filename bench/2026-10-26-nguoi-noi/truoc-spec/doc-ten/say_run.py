import json, subprocess, time, os, sys
tag = sys.argv[1]
env = dict(os.environ)
w = subprocess.Popen(["../axtrace/axtrace", "watch", "com.google.Chrome", f"out/{tag}-watch.jsonl", "0.25"], env=env)
time.sleep(1.5); t0 = time.time(); steps = []
lines = ["Hello everyone, this is a short test of the meeting audio, please ignore it.",
         "We are checking whether the speaking indicator is visible to assistive technology.",
         "Short sentence.",
         "This is the last test sentence, thank you for your patience, goodbye."]
time.sleep(3)
for s in lines:
    steps.append({"t": time.time(), "g": "phong2", "on": True})
    subprocess.run(["say", "-v", "Samantha", s])
    steps.append({"t": time.time(), "g": "phong2", "on": False})
    time.sleep(4)
w.terminate(); w.wait()
json.dump({"t0": t0, "steps": steps}, open(f"out/{tag}-truth.json", "w"), indent=1)
print("xong", [round(x["t"] - t0, 1) for x in steps])
