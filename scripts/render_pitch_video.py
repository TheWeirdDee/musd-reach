import os
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

SCENE_CONFIGS = [
    {
        "id": "scene_01",
        "audio": "audio_build/scene_01.mp3",
        "dur": 12.10,
        "title": "THE PROBLEM: NATIVE SAVINGS LIQUIDITY ISOLATION",
        "badge": "0:00 - 0:12 | HOOK & PROBLEM",
        "img": r"evidence\product-review\after\landing-1280.png",
        "sub": "What if your savings could stay on Mezo, while you used a claim on them on another blockchain?",
        "callout_title": "Current Mezo Limitation",
        "callout_text": "Moving savings value to Base or DeFi normally requires withdrawing from the native vault, giving up the savings position and accrued benefits."
    },
    {
        "id": "scene_02",
        "audio": "audio_build/scene_02.mp3",
        "dur": 11.98,
        "title": "THE SOLUTION: MEZO NATIVE SAVINGS ↔ PORTABLE CLAIMS",
        "badge": "0:12 - 0:24 | ARCHITECTURE",
        "img": r"evidence\product-review\after\developers-1280.png",
        "sub": "MUSD Reach changes that. Your savings position stays right on Mezo. We wrap and lock shares, then issue a backed claim on Base.",
        "callout_title": "Architecture: Mezo (31611) ↔ Base (84532)",
        "callout_text": "Native sMUSD → wSMUSD (ERC-4626 wrapper) → Locked in Source Gateway → Wormhole VAA → rwSMUSD minted on Base Sepolia."
    },
    {
        "id": "scene_03",
        "audio": "audio_build/scene_03.mp3",
        "dur": 21.43,
        "title": "TESTNET DEMO: WALLET CONNECTION & 6 MUSD LOCK",
        "badge": "0:24 - 0:45 | LIVE MEZO TRANSACTION",
        "img": r"evidence\product-review\after\app-wrap-1280.png",
        "sub": "Here is the live application. I connect my wallet, enter six MUSD, and initiate the atomic wrap and lock on Mezo testnet.",
        "callout_title": "Mezo Testnet Tx: 0x1fdfc665...99d7",
        "callout_text": "Block 16279430: 6.0 MUSD deposited to native vault → 6.0 wSMUSD minted & locked → Wormhole ISSUE message sequence 0 published."
    },
    {
        "id": "scene_04",
        "audio": "audio_build/scene_04.mp3",
        "dur": 17.62,
        "title": "CROSS-CHAIN ISSUANCE: WORMHOLE VAA → BASE SEPOLIA",
        "badge": "0:45 - 1:03 | GUARDIAN ATTESTATION & MINT",
        "img": r"evidence\product-review\after\app-transfers-0x9fbde66ef230e7f12a6a4a3f86accf95ec3aca19e974b68f0ac9ae11246fc404-1280.png",
        "sub": "Wormhole carries the authenticated message to Base Sepolia. The destination gateway verifies signatures and mints exactly six rwSMUSD.",
        "callout_title": "Base Sepolia Tx: 0x77f19efa...1455",
        "callout_text": "Block 48406788: Guardian digest 0x8e4a6b... verified. Transfer ID consumed. Exact 6.0 rwSMUSD minted to recipient. Underlier safe on Mezo."
    },
    {
        "id": "scene_05",
        "audio": "audio_build/scene_05.mp3",
        "dur": 20.71,
        "title": "PORTABILITY & RETURN: SECONDARY TRANSFER & REDEMPTION",
        "badge": "1:03 - 1:24 | TRANSFER, BURN & RELEASE",
        "img": r"evidence\product-review\after\app-redeem-1280.png",
        "sub": "That receipt is a standard ERC-20. It moves freely to another wallet, and when burned, releases the underlying value on Mezo.",
        "callout_title": "Verified End-to-End Round Trip",
        "callout_text": "BaseScan Tx 0x52c1...7760: 3 rwSMUSD transferred to 0x3a71... Secondary burns for shares; primary burns for MUSD. Mezo Tx 0x3fad...6ae0 settles."
    },
    {
        "id": "scene_06",
        "audio": "audio_build/scene_06.mp3",
        "dur": 16.54,
        "title": "MATHEMATICAL PROOF: 62/62 INVARIANTS & RECOVERY",
        "badge": "1:24 - 1:40 | ON-CHAIN RECONCILIATION",
        "img": r"evidence\product-review\after\proof-testnet-2026-10-21T11-23-33-084Z-1280.png",
        "sub": "This is making savings positions portable. Our public proof engine reconciles every locked share in real time: 62 checks passing, discrepancy zero.",
        "callout_title": "On-Chain Conservation Law",
        "callout_text": "Locked wSMUSD == Remote Supply + In-Flight Messages. Discrepancy: 0.000000000000000000 (BALANCED). Slippage protection parked & recovered."
    },
    {
        "id": "scene_07",
        "audio": "audio_build/scene_07.mp3",
        "dur": 16.46,
        "title": "CONCLUSION: SAVE ON MEZO. REACH FURTHER.",
        "badge": "1:40 - 1:57 | MEZO BUILDATHON 2026",
        "img": r"MUSD-Reach-Thumbnail.png",
        "sub": "MUSD Reach keeps core savings liquidity on Mezo while empowering users to reach the broader crypto economy. Your savings stay on Mezo.",
        "callout_title": "Verified & Submission-Ready",
        "callout_text": "Live Web App: musd-reach.vercel.app | GitHub: github.com/TheWeirdDee/musd-reach | Built for the 2026 Mezo Buildathon."
    }
]

def render_scene_still(cfg, out_path):
    W, H = 1920, 1080
    canvas = Image.new("RGBA", (W, H), (10, 14, 23, 255))
    draw = ImageDraw.Draw(canvas)

    # Gradient background
    for y in range(H):
        r = int(10 + (y / H) * 8)
        g = int(14 + (y / H) * 10)
        b = int(24 + (y / H) * 16)
        draw.line([(0, y), (W, y)], fill=(r, g, b, 255))

    # Glows
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([(1200, -100), (2000, 700)], fill=(245, 158, 11, 25)) # Mezo amber
    gd.ellipse([(-100, 400), (700, 1100)], fill=(0, 82, 255, 30))  # Base blue
    glow = glow.filter(ImageFilter.GaussianBlur(100))
    canvas.alpha_composite(glow)
    draw = ImageDraw.Draw(canvas)

    # Fonts
    try:
        f_top = ImageFont.truetype("arialbd.ttf", 22)
        f_title = ImageFont.truetype("arialbd.ttf", 36)
        f_call_title = ImageFont.truetype("arialbd.ttf", 24)
        f_call_txt = ImageFont.truetype("arial.ttf", 20)
        f_sub = ImageFont.truetype("arialbd.ttf", 24)
    except:
        f_top = ImageFont.load_default()
        f_title = ImageFont.load_default()
        f_call_title = ImageFont.load_default()
        f_call_txt = ImageFont.load_default()
        f_sub = ImageFont.load_default()

    # 1. Top Header Bar
    draw.rounded_rectangle([60, 30, W - 60, 85], radius=14, fill=(15, 23, 42, 230), outline=(51, 65, 85), width=1)
    draw.text((85, 45), "MUSD REACH  •  MEZO BUILDATHON 2026", font=f_top, fill=(251, 191, 36))
    draw.text((W - 480, 45), cfg["badge"], font=f_top, fill=(56, 189, 248))

    # 2. Main Title Header
    draw.text((60, 105), cfg["title"], font=f_title, fill=(255, 255, 255))

    # 3. Main Screenshot / Visual Area
    img_path = cfg["img"]
    if os.path.exists(img_path):
        app_img = Image.open(img_path).convert("RGBA")
        # Layout: Left side screenshot (width ~1180), Right side callout details (~560)
        if cfg["id"] == "scene_07":
            # Show full thumbnail centered or scaled
            app_w = 1240
            aspect = app_img.height / app_img.width
            app_h = int(app_w * aspect)
            if app_h > 720:
                app_h = 720
                app_w = int(app_h / aspect)
            app_resized = app_img.resize((app_w, app_h), Image.Resampling.LANCZOS)
            sx = 60
            sy = 175
            draw.rounded_rectangle([sx - 6, sy - 6, sx + app_w + 6, sy + app_h + 6], radius=16, fill=(30, 41, 59), outline=(245, 158, 11), width=2)
            canvas.paste(app_resized, (sx, sy))
        else:
            app_w = 1200
            aspect = app_img.height / app_img.width
            app_h = int(app_w * aspect)
            if app_h > 720:
                app_h = 720
                app_w = int(app_h / aspect)
            app_resized = app_img.resize((app_w, app_h), Image.Resampling.LANCZOS)
            sx = 60
            sy = 175
            draw.rounded_rectangle([sx - 6, sy - 6, sx + app_w + 6, sy + app_h + 6], radius=16, fill=(30, 41, 59), outline=(99, 102, 241, 180), width=2)
            canvas.paste(app_resized, (sx, sy))

    # 4. Right Side Callout Card
    cx = 1300
    cy = 175
    cw = 560
    ch = 720
    draw.rounded_rectangle([cx, cy, cx + cw, cy + ch], radius=18, fill=(15, 23, 42, 240), outline=(51, 65, 85), width=2)

    # Card header badge
    draw.rounded_rectangle([cx + 30, cy + 30, cx + cw - 30, cy + 85], radius=12, fill=(30, 41, 59, 220), outline=(245, 158, 11, 150), width=1)
    draw.text((cx + 50, cy + 45), cfg["callout_title"], font=f_call_title, fill=(251, 191, 36))

    # Card explanation text with line wrapping
    words = cfg["callout_text"].split()
    lines = []
    cur_line = []
    for w in words:
        cur_line.append(w)
        test_str = " ".join(cur_line)
        bbox = f_call_txt.getbbox(test_str)
        if (bbox[2] - bbox[0]) > (cw - 80):
            cur_line.pop()
            lines.append(" ".join(cur_line))
            cur_line = [w]
    if cur_line:
        lines.append(" ".join(cur_line))

    ty = cy + 115
    for l in lines:
        draw.text((cx + 40, ty), l, font=f_call_txt, fill=(226, 232, 240))
        ty += 34

    # Card Metrics & Proof Points
    proof_y = cy + 340
    draw.line([(cx + 40, proof_y - 20), (cx + cw - 40, proof_y - 20)], fill=(51, 65, 85), width=1)

    points = [
        ("Mezo Chain ID", "31611 (Testnet)"),
        ("Base Chain ID", "84532 (Base Sepolia)"),
        ("Messaging", "Wormhole Guardian Core"),
        ("Token Backing", "1:1 Native Vault Shares"),
        ("Conservation", "Discrepancy 0 (BALANCED)"),
        ("Status", "62 / 62 Checks Verified"),
    ]
    for lbl, val in points:
        draw.text((cx + 40, proof_y), lbl, font=f_call_txt, fill=(148, 163, 184))
        draw.text((cx + cw - 260, proof_y), val, font=f_call_title, fill=(56, 189, 248) if "0" in val or "62" in val else (255, 255, 255))
        proof_y += 50

    # 5. Bottom Subtitle / Captions Bar
    sub_y = H - 120
    draw.rounded_rectangle([60, sub_y, W - 60, sub_y + 80], radius=16, fill=(11, 15, 25, 245), outline=(99, 102, 241, 180), width=2)
    # Draw glowing dot
    draw.ellipse([(85, sub_y + 30), (105, sub_y + 50)], fill=(34, 197, 94))
    draw.text((120, sub_y + 26), cfg["sub"], font=f_sub, fill=(241, 245, 249))

    canvas.convert("RGB").save(out_path, quality=95)
    print(f"Rendered still: {out_path}")

def render_pitch_video():
    os.makedirs("video_build", exist_ok=True)
    scene_clips = []

    for i, cfg in enumerate(SCENE_CONFIGS, 1):
        still_path = f"video_build/still_{i:02d}.png"
        clip_path = f"video_build/clip_{i:02d}.mp4"
        render_scene_still(cfg, still_path)

        audio_path = cfg["audio"]
        dur = cfg["dur"]

        # Render 30fps 1080p clip with audio
        # Using subtle zoom/pan filter or static high-quality loop
        cmd = [
            FFMPEG, "-y",
            "-loop", "1",
            "-i", still_path,
            "-i", audio_path,
            "-c:v", "libx264",
            "-tune", "stillimage",
            "-c:a", "aac",
            "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            "-t", str(dur),
            clip_path
        ]
        print(f"Encoding clip {clip_path} (duration: {dur}s)...")
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0:
            print(f"Error encoding clip {i}: {res.stderr}")
            return
        scene_clips.append(clip_path)

    # Concat all clips into MUSD-Reach-Pitch-2min.mp4
    concat_txt = "video_build/concat.txt"
    with open(concat_txt, "w") as f:
        for c in scene_clips:
            # use forward slashes for ffmpeg concat
            f.write(f"file '{os.path.abspath(c).replace(os.sep, '/')}'\n")

    out_final = "MUSD-Reach-Pitch-2min.mp4"
    print(f"Concatenating clips into {out_final}...")
    concat_cmd = [
        FFMPEG, "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_txt,
        "-c", "copy",
        out_final
    ]
    res = subprocess.run(concat_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print(f"Error concatenating: {res.stderr}")
        return

    # Check final duration
    dur_cmd = [FFMPEG, "-i", out_final]
    res_dur = subprocess.run(dur_cmd, stderr=subprocess.PIPE, text=True)
    for line in res_dur.stderr.splitlines():
        if "Duration:" in line:
            print(f"FINAL PITCH VIDEO DURATION: {line.strip()}")
            break
    print(f"Successfully generated {out_final}!")

if __name__ == "__main__":
    render_pitch_video()
