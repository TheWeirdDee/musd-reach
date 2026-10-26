import os
import subprocess
import asyncio
import edge_tts
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
VOICE = "en-US-ChristopherNeural"

TESTS = [
    {
        "id": "test_01",
        "title": "TEST 1 — WALLET CONNECTION & ACCOUNT STATE",
        "img": r"evidence\product-review\after\app-1280.png",
        "dur": 22.0,
        "text": "Test one: Wallet connection and account state. We open the live deployed application on Mezo testnet. The wallet chooser detects our injected testnet wallet and connects address zero-x-zero-F-fifty-seven. Chain ID thirty-one-six-eleven is detected, and our live balance of seventeen-hundred ninety-seven MUSD loads immediately from the RPC.",
        "points": [
            ("Chain ID", "31611 (Mezo Testnet)"),
            ("Connected Address", "0x0F579957D94D1D12Fbb0dE3A495180629098Efe6"),
            ("Live MUSD Balance", "1,797.50 MUSD"),
            ("Wallet Chooser", "EIP-6963 / Injected Support"),
        ]
    },
    {
        "id": "test_02",
        "title": "TEST 2 — SAVINGS WRAPPING (MUSD → wSMUSD)",
        "img": r"evidence\product-review\after\app-wrap-1280.png",
        "dur": 24.0,
        "text": "Test two: Savings and wrapping. To make Mezo native savings portable, MUSD is deposited into the native savings vault through our ReachSavingsWrapper. Six MUSD is wrapped into six wSMUSD shares at the exact current share price, confirmed on Mezo block explorer at block sixteen-twenty-seven-nine-four-thirty.",
        "points": [
            ("Wrapper Contract", "0xf8cF6fCCC7bcF2860BfAD1Ea4A6018D446eb4306"),
            ("Native Vault Proxy", "0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16"),
            ("Wrapped Amount", "6.000000000000000000 wSMUSD"),
            ("Yield Model", "ERC-4626 Share Accounting"),
        ]
    },
    {
        "id": "test_03",
        "title": "TEST 3 — MAKE SAVINGS PORTABLE (LOCK & ISSUE)",
        "img": r"evidence\product-review\after\app-portable-new-1280.png",
        "dur": 24.0,
        "text": "Test three: Making savings portable. The six wSMUSD shares are locked in the ReachSourceGateway on Mezo testnet. The transaction emits an authenticated Wormhole ISSUE event, creating a unique transfer ID. The underlying savings shares remain locked and productive in the Mezo native vault.",
        "points": [
            ("Source Gateway", "0xA5c70F8D6B329ED6c2d15D604B66FafC3A6C96d3"),
            ("Tx Hash", "0x1fdfc665716297805f5af60961df8808ddfbe9466a8d8b6d2ea10809266099d7"),
            ("Transfer ID", "0x9fbde66ef230e7f12a6a4a3f86accf95ec3aca19e974b68f0ac9ae11246fc404"),
            ("Locked Shares", "6.0 wSMUSD"),
        ]
    },
    {
        "id": "test_04",
        "title": "TEST 4 — WORMHOLE CROSS-CHAIN MESSAGING",
        "img": r"evidence\product-review\after\app-transfers-0x9fbde66ef230e7f12a6a4a3f86accf95ec3aca19e974b68f0ac9ae11246fc404-1280.png",
        "dur": 24.0,
        "text": "Test four: Wormhole cross-chain messaging. The Wormhole guardian network observes the source lock event, verifies the emitter and payload fields, and publishes a guardian-signed verifiable action approval, digest eight-E-four-A-six-B. The live relayer and UI track this message through to destination delivery.",
        "points": [
            ("Wormhole Emitter", "0x000...a5c70f8d6b329ed6c2d15d604b66fafc3a6c96d3"),
            ("VAA Digest", "0x8e4a6b6dcdb84e818496122d5d3de3df1e007f56a107ff3e4bcd6bc807657750"),
            ("Consistency Level", "202 (Mezo Testnet Finality)"),
            ("Guardian Signatures", "Verified Live on Wormhole Core"),
        ]
    },
    {
        "id": "test_05",
        "title": "TEST 5 — RECEIPT ISSUANCE ON BASE SEPOLIA",
        "img": r"evidence\fork-rehearsal\browser-review-2026-10-25\e2e-minted.png",
        "dur": 24.0,
        "text": "Test five: Receipt issuance. The ReachDestinationGateway on Base Sepolia verifies the VAA, checks chain IDs, consumes the transfer ID to prevent replays, and mints exactly six rwSMUSD receipts to our destination address. Confirmed on BaseScan at transaction hash zero-x-seven-seven-F-one-nine.",
        "points": [
            ("Destination Gateway", "0x50436eB8F8213c7df773F2c331Bb41e1fecb5a23"),
            ("Base Sepolia Tx", "0x77f19efa4666a4f0e1f2962ed62c4fbb3f398c16116351d10e83792053a81455"),
            ("Receipt Token", "0x02777A938e69f848d4413b9033D225f0D1444e89 (rwSMUSD)"),
            ("Minted Amount", "6.000000000000000000 rwSMUSD"),
        ]
    },
    {
        "id": "test_06",
        "title": "TEST 6 — TRANSFER THE RECEIPT (SECONDARY WALLET)",
        "img": r"evidence\product-review\after\app-history-1280.png",
        "dur": 24.0,
        "text": "Test six: Transfer the receipt. rwSMUSD is a fully standard ERC-20 token with permit support. We execute a live transfer of three rwSMUSD to a second authorized wallet, zero-x-three-A-seventy-one. Both wallet balances update immediately on BaseScan, proving that receipt ownership moves independently of the locked Mezo position.",
        "points": [
            ("Sender Wallet", "0x0F579957D94D1D12Fbb0dE3A495180629098Efe6"),
            ("Recipient Wallet", "0x3a71111bb6578Beb61E39af9C09223c02b41D701"),
            ("BaseScan Tx", "0x52c1cdaa9ace5d1b73fdfd5d0b01f1035b52b019525d925c1b8bcb0fda2f7760"),
            ("Transferred Amount", "3.000000000000000000 rwSMUSD"),
        ]
    },
    {
        "id": "test_07",
        "title": "TEST 7 — RETURN & MULTI-MODE REDEMPTION",
        "img": r"evidence\product-review\after\app-redeem-1280.png",
        "dur": 26.0,
        "text": "Test seven: Return and redeem. Receipt holders burn rwSMUSD on Base Sepolia. We test both supported redemption outcomes: secondary burns for raw wSMUSD shares, while primary burns for unwrapped MUSD payout. Wormhole carries the REDEEM messages back to Mezo, releasing shares and paying MUSD on Mezo testnet.",
        "points": [
            ("Shares Mode Burn Tx", "0x5e6bc5d38a293abc07fafd92e6f723f08668bb3aee4ece21b8166b3aed2b5337"),
            ("MUSD Mode Burn Tx", "0x480b9adf783eb270b3d7877633a2b1823a7d6175d936f430983751c6f2808b97"),
            ("Mezo Release Shares Tx", "0xb65a46b289882719fbc9729075dbf1b88098d6c0e4b81eadfab64207ba06af11"),
            ("Mezo Redeem MUSD Tx", "0x3fadf55034dfe4a21d5015fa6cfeec92c426e96be401cb6c144677db47e86ae0"),
        ]
    },
    {
        "id": "test_08",
        "title": "TEST 8 — SETTLEMENT RECOVERY & SLIPPAGE PROTECTION",
        "img": r"evidence\product-review\after\docs-recovery-1280.png",
        "dur": 26.0,
        "text": "Test eight: Settlement recovery. When a redemption has an unreachable minimum asset requirement, the Mezo gateway does not lose funds. Instead, it parks the redemption as a pending settlement, verified at transaction zero-x-B-eight-nine-C. Non-recipients cannot tamper with it, and the recipient recovers at an acceptable minimum via transaction zero-x-five-one-six-five.",
        "points": [
            ("Parked Settlement Tx", "0xb89ca393e22a8a13f4c653c3f43902bdf6d26078b5ded52ed21fd34e4c49c29e"),
            ("Slippage Invariant", "Zero Fund Loss on Unmet Minimum"),
            ("Permissionless Retry", "Rejects Non-Recipient Tampering"),
            ("Recipient Recovery Tx", "0x5165900940b2fc9de436c1802e504f93c768bafaefb0041d3cdc050255562be9"),
        ]
    },
    {
        "id": "test_09",
        "title": "TEST 9 — MATHEMATICAL PROOF & RECONCILIATION",
        "img": r"evidence\product-review\after\proof-testnet-2026-10-21T11-23-33-084Z-1280.png",
        "dur": 25.0,
        "text": "Test nine: Mathematical proof and backing reconciliation. We inspect the public proof dashboard. The conservation equation holds: locked wSMUSD equals remote supply plus in-flight messages. The on-chain state discrepancy is exactly zero, with all sixty-two automated verifier checks passing cleanly.",
        "points": [
            ("Conservation Law", "Locked == Remote Supply + In-Flight"),
            ("Discrepancy", "0.000000000000000000 (BALANCED)"),
            ("Verifier Checks", "62 PASS, 0 FAIL"),
            ("Audit Status", "Public RPC Verified"),
        ]
    },
    {
        "id": "test_10",
        "title": "TEST 10 — REGISTRY, STATUS & INTEGRATIONS",
        "img": r"evidence\product-review\after\contracts-1280.png",
        "dur": 22.0,
        "text": "Test ten: Registry, diagnostics, and integrations. We verify the on-chain contract registry, transaction history indexing, and SDK client documentation. Every deployed bytecode is verified against repo artifacts, providing complete transparency for the 2026 Mezo Buildathon.",
        "points": [
            ("Contract Registry", "musd-reach.vercel.app/contracts"),
            ("Public Proof", "musd-reach.vercel.app/proof"),
            ("API Health", "musd-reach-api.onrender.com/health"),
            ("Mezo Buildathon", "Production-Ready Submission"),
        ]
    }
]

async def generate_full_demo_audio():
    os.makedirs("audio_full_demo", exist_ok=True)
    for t in TESTS:
        out_mp3 = f"audio_full_demo/{t['id']}.mp3"
        print(f"Generating audio for {t['id']}...")
        comm = edge_tts.Communicate(t["text"], VOICE, rate="+10%")
        await comm.save(out_mp3)
    print("Full demo audio generated.")

def render_full_demo_still(t, out_path):
    W, H = 1920, 1080
    canvas = Image.new("RGBA", (W, H), (10, 14, 23, 255))
    draw = ImageDraw.Draw(canvas)

    for y in range(H):
        r = int(10 + (y / H) * 8)
        g = int(14 + (y / H) * 10)
        b = int(24 + (y / H) * 16)
        draw.line([(0, y), (W, y)], fill=(r, g, b, 255))

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([(1200, -100), (2000, 700)], fill=(245, 158, 11, 25))
    gd.ellipse([(-100, 400), (700, 1100)], fill=(0, 82, 255, 30))
    glow = glow.filter(ImageFilter.GaussianBlur(100))
    canvas.alpha_composite(glow)
    draw = ImageDraw.Draw(canvas)

    try:
        f_top = ImageFont.truetype("arialbd.ttf", 22)
        f_title = ImageFont.truetype("arialbd.ttf", 34)
        f_call_title = ImageFont.truetype("arialbd.ttf", 22)
        f_call_txt = ImageFont.truetype("arial.ttf", 19)
        f_sub = ImageFont.truetype("arialbd.ttf", 23)
    except:
        f_top = ImageFont.load_default()
        f_title = ImageFont.load_default()
        f_call_title = ImageFont.load_default()
        f_call_txt = ImageFont.load_default()
        f_sub = ImageFont.load_default()

    # Top Header Bar
    draw.rounded_rectangle([60, 30, W - 60, 85], radius=14, fill=(15, 23, 42, 230), outline=(51, 65, 85), width=1)
    draw.text((85, 45), "MUSD REACH  •  COMPLETE WORKFLOW AUDIT & VERIFICATION", font=f_top, fill=(251, 191, 36))
    draw.text((W - 460, 45), "FULL PUBLIC-TESTNET EVIDENCE", font=f_top, fill=(56, 189, 248))

    # Main Title Header
    draw.text((60, 105), t["title"], font=f_title, fill=(255, 255, 255))

    # Main Screenshot
    img_path = t["img"]
    if os.path.exists(img_path):
        app_img = Image.open(img_path).convert("RGBA")
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

    # Right Side Card
    cx = 1300
    cy = 175
    cw = 560
    ch = 720
    draw.rounded_rectangle([cx, cy, cx + cw, cy + ch], radius=18, fill=(15, 23, 42, 240), outline=(51, 65, 85), width=2)

    draw.rounded_rectangle([cx + 30, cy + 30, cx + cw - 30, cy + 85], radius=12, fill=(30, 41, 59, 220), outline=(245, 158, 11, 150), width=1)
    draw.text((cx + 50, cy + 45), "Public Testnet Verified Data", font=f_call_title, fill=(251, 191, 36))

    proof_y = cy + 120
    for lbl, val in t["points"]:
        draw.text((cx + 40, proof_y), lbl, font=f_call_txt, fill=(148, 163, 184))
        draw.text((cx + 40, proof_y + 28), val, font=f_call_title, fill=(56, 189, 248) if "0x" in val or "31611" in val else (255, 255, 255))
        draw.line([(cx + 40, proof_y + 68), (cx + cw - 40, proof_y + 68)], fill=(30, 41, 59), width=1)
        proof_y += 85

    # Bottom Subtitle
    sub_y = H - 120
    draw.rounded_rectangle([60, sub_y, W - 60, sub_y + 80], radius=16, fill=(11, 15, 25, 245), outline=(99, 102, 241, 180), width=2)
    draw.ellipse([(85, sub_y + 30), (105, sub_y + 50)], fill=(34, 197, 94))
    draw.text((120, sub_y + 26), t["text"], font=f_sub, fill=(241, 245, 249))

    canvas.convert("RGB").save(out_path, quality=95)

def render_full_demo():
    asyncio.run(generate_full_demo_audio())
    os.makedirs("full_demo_build", exist_ok=True)
    clips = []

    for i, t in enumerate(TESTS, 1):
        still_path = f"full_demo_build/still_{i:02d}.png"
        clip_path = f"full_demo_build/clip_{i:02d}.mp4"
        audio_path = f"audio_full_demo/{t['id']}.mp3"
        render_full_demo_still(t, still_path)

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
            "-shortest",
            clip_path
        ]
        print(f"Encoding full demo clip {clip_path}...")
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0:
            print(f"Error encoding {clip_path}: {res.stderr}")
            return
        clips.append(clip_path)

    concat_txt = "full_demo_build/concat.txt"
    with open(concat_txt, "w") as f:
        for c in clips:
            f.write(f"file '{os.path.abspath(c).replace(os.sep, '/')}'\n")

    out_final = "MUSD-Reach-Full-Demo.mp4"
    print(f"Concatenating into {out_final}...")
    concat_cmd = [
        FFMPEG, "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_txt,
        "-c", "copy",
        out_final
    ]
    subprocess.run(concat_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    print(f"Full demo generated: {out_final}!")

if __name__ == "__main__":
    render_full_demo()
