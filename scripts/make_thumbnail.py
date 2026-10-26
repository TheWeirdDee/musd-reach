import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def create_thumbnail():
    width = 1920
    height = 1080
    img = Image.new("RGBA", (width, height), (11, 15, 25, 255))
    draw = ImageDraw.Draw(img)

    # 1. Gradient background & ambient glows
    # Base dark gradient
    for y in range(height):
        ratio = y / height
        r = int(10 + ratio * 8)
        g = int(14 + ratio * 12)
        b = int(26 + ratio * 24)
        draw.line([(0, y), (width, y)], fill=(r, g, b, 255))

    # Glow overlays
    # Mezo Amber Glow on Left
    glow_left = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(glow_left)
    g_draw.ellipse([(-200, 100), (600, 900)], fill=(245, 158, 11, 35))
    glow_left = glow_left.filter(ImageFilter.GaussianBlur(120))
    img.alpha_composite(glow_left)

    # Base Blue Glow on Right
    glow_right = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    g_draw2 = ImageDraw.Draw(glow_right)
    g_draw2.ellipse([(1300, 200), (2100, 1000)], fill=(0, 82, 255, 45))
    glow_right = glow_right.filter(ImageFilter.GaussianBlur(130))
    img.alpha_composite(glow_right)

    draw = ImageDraw.Draw(img)

    # Try loading system fonts or default
    try:
        font_badge = ImageFont.truetype("arialbd.ttf", 24)
        font_title = ImageFont.truetype("arialbd.ttf", 86)
        font_subtitle = ImageFont.truetype("arial.ttf", 36)
        font_stat_val = ImageFont.truetype("arialbd.ttf", 38)
        font_stat_lbl = ImageFont.truetype("arial.ttf", 20)
        font_pill = ImageFont.truetype("arialbd.ttf", 22)
    except:
        font_badge = ImageFont.load_default()
        font_title = ImageFont.load_default()
        font_subtitle = ImageFont.load_default()
        font_stat_val = ImageFont.load_default()
        font_stat_lbl = ImageFont.load_default()
        font_pill = ImageFont.load_default()

    # 2. Top Badge
    badge_text = "MEZO BUILDATHON 2026  •  WORKING PRODUCT DEMO"
    draw.rounded_rectangle([120, 120, 780, 170], radius=25, fill=(30, 41, 59, 220), outline=(245, 158, 11, 200), width=2)
    draw.text((150, 133), badge_text, font=font_badge, fill=(251, 191, 36))

    # 3. Main Title
    draw.text((120, 210), "MUSD REACH", font=font_title, fill=(255, 255, 255))

    # 4. Catchphrase / Subtitle
    sub1 = "Your savings stay on Mezo."
    sub2 = "Their reach doesn't have to."
    draw.text((120, 320), sub1, font=font_subtitle, fill=(226, 232, 240))
    draw.text((120, 375), sub2, font=font_subtitle, fill=(56, 189, 248))

    # 5. Architecture Pills / Chain route
    pills = [
        ("Mezo Testnet (31611)", (245, 158, 11)),
        ("Wormhole Messaging", (168, 85, 247)),
        ("Base Sepolia (84532)", (0, 128, 255)),
    ]
    px = 120
    for ptext, col in pills:
        bbox = font_pill.getbbox(ptext)
        pw = bbox[2] - bbox[0] + 36
        draw.rounded_rectangle([px, 455, px + pw, 505], radius=15, fill=(15, 23, 42, 230), outline=col, width=2)
        draw.text((px + 18, 468), ptext, font=font_pill, fill=(255, 255, 255))
        px += pw + 20

    # 6. Verification & Stats Cards (Bottom Left)
    stats = [
        ("62 / 62 PASS", "On-Chain Verifier", (34, 197, 94)),
        ("0.00000000", "State Discrepancy", (56, 189, 248)),
        ("100% NON-CUSTODIAL", "Public Testnet Proven", (251, 191, 36)),
    ]
    sx = 120
    sy = 540
    card_w = 260
    card_h = 130
    for val, lbl, val_col in stats:
        draw.rounded_rectangle([sx, sy, sx + card_w, sy + card_h], radius=16, fill=(15, 23, 42, 210), outline=(51, 65, 85), width=2)
        draw.text((sx + 20, sy + 25), val, font=font_stat_val, fill=val_col)
        draw.text((sx + 20, sy + 75), lbl, font=font_stat_lbl, fill=(148, 163, 184))
        sx += card_w + 20

    # 7. Live URLs bar at bottom
    draw.rounded_rectangle([120, 710, 960, 770], radius=16, fill=(15, 23, 42, 240), outline=(71, 85, 105), width=1)
    draw.text((150, 727), "musd-reach.vercel.app  |  github.com/TheWeirdDee/musd-reach", font=font_pill, fill=(203, 213, 225))

    # 8. Right side: Live Product Mockup / App Screenshot card
    app_img_path = r"evidence\product-review\after\app-1280.png"
    if os.path.exists(app_img_path):
        app_img = Image.open(app_img_path).convert("RGBA")
        # Resize to fit nicely on the right
        app_w = 780
        aspect = app_img.height / app_img.width
        app_h = int(app_w * aspect)
        app_resized = app_img.resize((app_w, app_h), Image.Resampling.LANCZOS)

        # Create card with shadow
        card_x = 1020
        card_y = 170
        # Draw border frame around screenshot
        draw.rounded_rectangle([card_x - 8, card_y - 8, card_x + app_w + 8, card_y + app_h + 8], radius=20, fill=(30, 41, 59, 255), outline=(99, 102, 241, 200), width=3)
        img.paste(app_resized, (card_x, card_y))

        # Add live verified badge on screenshot
        draw.rounded_rectangle([card_x + 30, card_y + 30, card_x + 280, card_y + 75], radius=12, fill=(16, 185, 129, 230))
        draw.text((card_x + 45, card_y + 40), "● LIVE TESTNET V2", font=font_badge, fill=(255, 255, 255))

    # Save final thumbnail
    out_path = r"MUSD-Reach-Thumbnail.png"
    img.convert("RGB").save(out_path, quality=95)
    print(f"Thumbnail saved to {out_path}")

if __name__ == "__main__":
    create_thumbnail()
