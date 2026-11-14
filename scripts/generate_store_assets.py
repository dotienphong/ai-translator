import subprocess
import os
import tempfile
import shutil
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
STORE_DIR = os.path.join(ROOT, "store_upload")
APP_IMG_DIR = os.path.join(ROOT, "website", "src", "assets", "img", "app")
SVG_LOGO = os.path.join(ROOT, "app-icon.svg")
CHROME_BIN = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

os.makedirs(STORE_DIR, exist_ok=True)

def render_html_to_png(html_content, width, height, out_file):
    tmp_dir = os.path.join(tempfile.gettempdir(), f"store_render_{os.path.basename(out_file).replace('.', '_')}")
    os.makedirs(tmp_dir, exist_ok=True)
    
    html_file = os.path.join(tmp_dir, "index.html")
    with open(html_file, "w", encoding="utf-8") as f:
        f.write(html_content)
        
    cmd = [
        CHROME_BIN,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--default-background-color=00000000",
        "--hide-scrollbars",
        f"--window-size={width},{height}",
        f"--user-data-dir={tmp_dir}",
        f"--screenshot={out_file}",
        f"file:///{os.path.abspath(html_file).replace(os.sep, '/')}"
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    shutil.rmtree(tmp_dir, ignore_errors=True)
    size_kb = os.path.getsize(out_file) / 1024
    print(f"Generated: {os.path.basename(out_file)} ({width}x{height}, {size_kb:.1f} KB)")


def generate_box_art():
    print("\n--- Generating 1:1 Box Art ---")
    svg_abs = os.path.abspath(SVG_LOGO).replace(os.sep, "/")
    
    for size in [2160, 1080]:
        out_file = os.path.join(STORE_DIR, f"store_logo_box_art_{size}x{size}.png")
        html = f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{
    width: {size}px;
    height: {size}px;
    background: transparent;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  img {{
    width: {size}px;
    height: {size}px;
    display: block;
  }}
</style>
</head>
<body>
  <img src="file:///{svg_abs}" />
</body>
</html>"""
        render_html_to_png(html, size, size, out_file)


def generate_poster_art():
    print("\n--- Generating 2:3 Poster Art ---")
    svg_abs = os.path.abspath(SVG_LOGO).replace(os.sep, "/")
    
    for (w, h) in [(1440, 2160), (720, 1080)]:
        out_file = os.path.join(STORE_DIR, f"store_poster_art_{w}x{h}.png")
        scale = w / 1440.0
        
        logo_size = int(580 * scale)
        title_size = int(84 * scale)
        sub_size = int(36 * scale)
        badge_font = int(26 * scale)
        pad_top = int(180 * scale)
        gap = int(32 * scale)
        
        html = f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{
    width: {w}px;
    height: {h}px;
    background: radial-gradient(circle at 50% 30%, #172a4d 0%, #0d172e 50%, #060a14 100%);
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    color: #ffffff;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: {pad_top}px;
    position: relative;
  }}
  
  .glow {{
    position: absolute;
    top: {int(120 * scale)}px;
    left: 50%;
    transform: translateX(-50%);
    width: {int(800 * scale)}px;
    height: {int(800 * scale)}px;
    background: radial-gradient(circle, rgba(59, 130, 246, 0.28) 0%, rgba(30, 64, 175, 0.08) 50%, transparent 70%);
    border-radius: 50%;
    pointer-events: none;
  }}
  
  .logo {{
    width: {logo_size}px;
    height: {logo_size}px;
    border-radius: {int(120 * scale)}px;
    box-shadow: 0 {int(30 * scale)}px {int(70 * scale)}px rgba(0, 0, 0, 0.6), 0 0 {int(40 * scale)}px rgba(59, 130, 246, 0.35);
    margin-bottom: {int(56 * scale)}px;
    z-index: 2;
  }}
  
  .title {{
    font-size: {title_size}px;
    font-weight: 800;
    letter-spacing: -1px;
    color: #ffffff;
    margin-bottom: {int(18 * scale)}px;
    text-shadow: 0 4px 16px rgba(0,0,0,0.5);
    z-index: 2;
  }}
  
  .subtitle {{
    font-size: {sub_size}px;
    font-weight: 500;
    color: #93c5fd;
    text-align: center;
    max-width: {int(1160 * scale)}px;
    line-height: 1.35;
    margin-bottom: {int(64 * scale)}px;
    z-index: 2;
  }}
  
  .badges {{
    display: flex;
    flex-direction: column;
    gap: {int(20 * scale)}px;
    align-items: center;
    z-index: 2;
  }}
  
  .badge {{
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(10px);
    padding: {int(16 * scale)}px {int(36 * scale)}px;
    border-radius: {int(40 * scale)}px;
    font-size: {badge_font}px;
    font-weight: 600;
    color: #e2e8f0;
    letter-spacing: 0.3px;
    display: flex;
    align-items: center;
    gap: {int(12 * scale)}px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
  }}
  
  .tagline-footer {{
    position: absolute;
    bottom: {int(80 * scale)}px;
    font-size: {int(24 * scale)}px;
    font-weight: 500;
    color: #64748b;
    letter-spacing: 1px;
    text-transform: uppercase;
  }}
</style>
</head>
<body>
  <div class="glow"></div>
  <img class="logo" src="file:///{svg_abs}" />
  <div class="title">AI Translator</div>
  <div class="subtitle">Live Translated Subtitles for Meetings & Audio</div>
  
  <div class="badges">
    <div class="badge">🔒 100% On-Device AI • Whisper & Local LLM</div>
    <div class="badge">🎙️ Real-Time Speaker Diarization</div>
    <div class="badge">🌐 Zoom • Teams • Google Meet • Any Audio</div>
  </div>
  
  <div class="tagline-footer">Private • Real-Time • Offline AI</div>
</body>
</html>"""
        render_html_to_png(html, w, h, out_file)


def generate_screenshots():
    print("\n--- Generating 10 High-Resolution Screenshots (1920x1080) ---")
    
    W, H = 1920, 1080
    
    # 10 screenshots definition:
    # (filename, title, subtitle, img_name, options)
    shots = [
        (
            "screenshot_01_realtime_translation.png",
            "Real-Time Meeting Translation",
            "Live speech-to-text with instant dual-language subtitles for Zoom, Teams, and Google Meet",
            "app-home-running.en.webp",
            {"scale": 0.82}
        ),
        (
            "screenshot_02_floating_subtitles.png",
            "Floating Desktop Subtitle Bar",
            "Stays on top of any conference call with click-through lock mode and custom opacity",
            "SPECIAL_MEETING_OVERLAY",
            {}
        ),
        (
            "screenshot_03_speaker_transcript.png",
            "Live Speaker Diarization & Transcript",
            "Distinguishes who is speaking in real time with synchronized time stamps",
            "app-transcript.en.webp",
            {"scale": 0.82}
        ),
        (
            "screenshot_04_dark_mode.png",
            "Sleek Modern Dark Mode",
            "Designed for low-light environments, late-night calls, and reduced eye strain",
            "app-home-running.dark.en.webp",
            {"scale": 0.82}
        ),
        (
            "screenshot_05_meeting_history.png",
            "Searchable Meeting History & Export",
            "Review past conversations, search key terms, and export subtitles to SRT or TXT",
            "app-history.en.webp",
            {"scale": 0.82}
        ),
        (
            "screenshot_06_domain_glossary.png",
            "Custom Terminology & Domain Glossary",
            "Maintain technical accuracy by defining industry terms, brand names, and jargon",
            "app-glossary.en.webp",
            {"scale": 0.82}
        ),
        (
            "screenshot_07_subtitle_customization.png",
            "Personalized Subtitle Styling",
            "Customize font size, contrast colors, background opacity, and screen placement",
            "app-settings-subtitles.en.webp",
            {"scale": 0.82}
        ),
        (
            "screenshot_08_dual_audio_source.png",
            "Dual Audio Source Routing",
            "Capture system speakers, external microphone, or both for complete two-way conversations",
            "app-settings-audio.en.webp",
            {"scale": 0.65, "crop_top": True}
        ),
        (
            "screenshot_09_quick_translate_compose.png",
            "Instant Type-and-Translate Compose Tool",
            "Draft and translate replies immediately without switching out of your active call",
            "app-settings-compose.en.webp",
            {"scale": 0.82}
        ),
        (
            "screenshot_10_on_device_privacy.png",
            "100% On-Device AI • Complete Privacy",
            "All speech recognition and LLM translation run locally. No audio leaves your machine",
            "app-settings-privacy.en.webp",
            {"scale": 0.82}
        ),
    ]

    for item in shots:
        filename, title, subtitle, img_name, opts = item
        out_file = os.path.join(STORE_DIR, filename)
        
        if img_name == "SPECIAL_MEETING_OVERLAY":
            overlay_file = os.path.join(APP_IMG_DIR, "overlay-default.en.webp").replace(os.sep, "/")
            html = f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    width: {W}px;
    height: {H}px;
    background: radial-gradient(circle at 50% 15%, #152238 0%, #0a0f1d 65%, #050811 100%);
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    color: #ffffff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    overflow: hidden;
    position: relative;
  }}
  .glow {{
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 1000px;
    height: 350px;
    background: radial-gradient(ellipse at center, rgba(59, 130, 246, 0.18) 0%, transparent 70%);
    pointer-events: none;
  }}
  .header {{
    text-align: center;
    margin-top: 36px;
    margin-bottom: 24px;
    z-index: 2;
  }}
  .header h1 {{
    font-size: 38px;
    font-weight: 700;
    letter-spacing: -0.5px;
    margin-bottom: 8px;
  }}
  .header p {{
    font-size: 20px;
    color: #94a3b8;
  }}
  
  /* Mock Video Call Container */
  .meeting-canvas {{
    width: 1380px;
    height: 820px;
    background: #0f172a;
    border-radius: 14px;
    box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.12);
    position: relative;
    overflow: hidden;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 12px;
    padding: 16px;
  }}
  
  .tile {{
    background: #1e293b;
    border-radius: 10px;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }}
  
  .tile-active {{
    border: 2px solid #3b82f6;
  }}
  
  .avatar {{
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 12px;
    box-shadow: 0 8px 20px rgba(0,0,0,0.3);
  }}
  
  .name-tag {{
    position: absolute;
    bottom: 12px;
    left: 14px;
    background: rgba(0, 0, 0, 0.65);
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    color: #e2e8f0;
    display: flex;
    align-items: center;
    gap: 6px;
  }}
  
  .speaking-indicator {{
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #10b981;
  }}

  /* Subtitle overlay float */
  .subtitle-float {{
    position: absolute;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    width: 1200px;
    z-index: 10;
    filter: drop-shadow(0 15px 30px rgba(0, 0, 0, 0.9));
  }}
  
  .subtitle-img {{
    width: 100%;
    height: auto;
    display: block;
    border-radius: 10px;
  }}
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="header">
    <h1>{title}</h1>
    <p>{subtitle}</p>
  </div>
  
  <div class="meeting-canvas">
    <div class="tile tile-active">
      <div class="avatar" style="background: linear-gradient(135deg, #f59e0b, #d97706);">KT</div>
      <div class="name-tag"><span class="speaking-indicator"></span> Kenji Takahashi (Tokyo)</div>
    </div>
    <div class="tile">
      <div class="avatar" style="background: linear-gradient(135deg, #8b5cf6, #6d28d9);">EL</div>
      <div class="name-tag">Emma Laurent (Paris)</div>
    </div>
    <div class="tile">
      <div class="avatar" style="background: linear-gradient(135deg, #10b981, #047857);">MS</div>
      <div class="name-tag">Michael Smith (New York)</div>
    </div>
    <div class="tile">
      <div class="avatar" style="background: linear-gradient(135deg, #ec4899, #be185d);">AL</div>
      <div class="name-tag">Anh Le (Hanoi)</div>
    </div>
    <div class="tile">
      <div class="avatar" style="background: linear-gradient(135deg, #06b6d4, #0891b2);">ZW</div>
      <div class="name-tag">Zhang Wei (Beijing)</div>
    </div>
    <div class="tile">
      <div class="avatar" style="background: linear-gradient(135deg, #6366f1, #4338ca);">DK</div>
      <div class="name-tag">David Kim (Seoul)</div>
    </div>

    <!-- Floating Subtitle Bar centered over meeting -->
    <div class="subtitle-float">
      <img class="subtitle-img" src="file:///{overlay_file}" />
    </div>
  </div>
</body>
</html>"""
            render_html_to_png(html, W, H, out_file)
        else:
            img_file = os.path.join(APP_IMG_DIR, img_name).replace(os.sep, "/")
            scale = opts.get("scale", 0.82)
            max_h = int(820 * scale)
            
            crop_style = ""
            if opts.get("crop_top"):
                crop_style = "max-height: 800px; object-fit: cover; object-position: top;"
                
            html = f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    width: {W}px;
    height: {H}px;
    background: radial-gradient(circle at 50% 15%, #152238 0%, #0a0f1d 65%, #050811 100%);
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    color: #ffffff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    overflow: hidden;
    position: relative;
  }}
  .glow {{
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 1000px;
    height: 350px;
    background: radial-gradient(ellipse at center, rgba(59, 130, 246, 0.18) 0%, transparent 70%);
    pointer-events: none;
  }}
  .header {{
    text-align: center;
    margin-top: 36px;
    margin-bottom: 24px;
    z-index: 2;
  }}
  .header h1 {{
    font-size: 38px;
    font-weight: 700;
    letter-spacing: -0.5px;
    margin-bottom: 8px;
    text-shadow: 0 2px 10px rgba(0,0,0,0.5);
  }}
  .header p {{
    font-size: 20px;
    color: #94a3b8;
  }}
  .window-container {{
    z-index: 2;
    display: flex;
    justify-content: center;
    align-items: center;
  }}
  .window-frame {{
    border-radius: 12px;
    box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.14);
    overflow: hidden;
    background: #18181b;
    display: block;
  }}
  .window-img {{
    display: block;
    width: auto;
    height: auto;
    max-height: 820px;
    {crop_style}
  }}
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="header">
    <h1>{title}</h1>
    <p>{subtitle}</p>
  </div>
  <div class="window-container">
    <div class="window-frame">
      <img class="window-img" src="file:///{img_file}" />
    </div>
  </div>
</body>
</html>"""
            render_html_to_png(html, W, H, out_file)


def generate_super_hero_art():
    print("\n--- Generating 16:9 Super Hero Art (Without text/logo for Store Banner & Trailer) ---")
    for (w, h) in [(1920, 1080), (3840, 2160)]:
        out_file = os.path.join(STORE_DIR, f"store_super_hero_art_{w}x{h}.png")
        scale = w / 1920.0
        
        html = f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    width: {w}px;
    height: {h}px;
    background: radial-gradient(ellipse at 50% 45%, #172a4d 0%, #0d172e 50%, #060a14 100%);
    overflow: hidden;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .ambient-glow-1 {{
    position: absolute;
    top: -15%;
    left: 20%;
    width: {int(1000 * scale)}px;
    height: {int(1000 * scale)}px;
    background: radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, rgba(37, 99, 235, 0.08) 50%, transparent 70%);
    border-radius: 50%;
    filter: blur({int(50 * scale)}px);
  }}
  .ambient-glow-2 {{
    position: absolute;
    bottom: -15%;
    right: 20%;
    width: {int(900 * scale)}px;
    height: {int(900 * scale)}px;
    background: radial-gradient(circle, rgba(147, 51, 234, 0.25) 0%, rgba(99, 102, 241, 0.08) 50%, transparent 70%);
    border-radius: 50%;
    filter: blur({int(50 * scale)}px);
  }}
  .wave-container {{
    position: absolute;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  svg {{
    width: {int(1600 * scale)}px;
    height: {int(600 * scale)}px;
    opacity: 0.9;
  }}
</style>
</head>
<body>
  <div class="ambient-glow-1"></div>
  <div class="ambient-glow-2"></div>
  <div class="wave-container">
    <svg viewBox="0 0 1600 600" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.1" />
          <stop offset="25%" stop-color="#60a5fa" stop-opacity="0.7" />
          <stop offset="50%" stop-color="#38bdf8" stop-opacity="0.95" />
          <stop offset="75%" stop-color="#818cf8" stop-opacity="0.7" />
          <stop offset="100%" stop-color="#c084fc" stop-opacity="0.1" />
        </linearGradient>
        <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#2563eb" stop-opacity="0.1" />
          <stop offset="30%" stop-color="#38bdf8" stop-opacity="0.5" />
          <stop offset="70%" stop-color="#a855f7" stop-opacity="0.6" />
          <stop offset="100%" stop-color="#ec4899" stop-opacity="0.1" />
        </linearGradient>
        <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.05" />
          <stop offset="50%" stop-color="#3b82f6" stop-opacity="0.5" />
          <stop offset="100%" stop-color="#6366f1" stop-opacity="0.05" />
        </linearGradient>
      </defs>
      <!-- Flowing audio translation soundwaves -->
      <path d="M0 300 Q200 120 400 300 T800 300 T1200 300 T1600 300" stroke="url(#grad1)" stroke-width="4.5" stroke-linecap="round" />
      <path d="M0 300 Q200 480 400 300 T800 300 T1200 300 T1600 300" stroke="url(#grad1)" stroke-width="2.5" stroke-dasharray="8 8" opacity="0.6" />
      
      <path d="M0 300 C300 160 500 440 800 300 C1100 160 1300 440 1600 300" stroke="url(#grad2)" stroke-width="3.5" stroke-linecap="round" />
      <path d="M0 300 C250 400 550 180 800 300 C1050 420 1350 200 1600 300" stroke="url(#grad3)" stroke-width="3" stroke-linecap="round" />
      
      <circle cx="800" cy="300" r="10" fill="#38bdf8" filter="drop-shadow(0 0 14px #38bdf8)" />
      <circle cx="600" cy="230" r="6" fill="#818cf8" filter="drop-shadow(0 0 10px #818cf8)" />
      <circle cx="1000" cy="370" r="6" fill="#c084fc" filter="drop-shadow(0 0 10px #c084fc)" />
      <circle cx="400" cy="300" r="7" fill="#60a5fa" filter="drop-shadow(0 0 10px #60a5fa)" />
      <circle cx="1200" cy="300" r="7" fill="#818cf8" filter="drop-shadow(0 0 10px #818cf8)" />
      <circle cx="200" cy="210" r="5" fill="#38bdf8" opacity="0.8" />
      <circle cx="1400" cy="390" r="5" fill="#c084fc" opacity="0.8" />
    </svg>
  </div>
</body>
</html>"""
        render_html_to_png(html, w, h, out_file)


if __name__ == "__main__":
    generate_box_art()
    generate_poster_art()
    generate_super_hero_art()
    generate_screenshots()
    print("\nALL ASSETS SUCCESSFULLY GENERATED IN store_upload/ !")

