import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1280, 640
img = Image.new("RGBA", (W, H), (11, 15, 23, 255))

# Create rich radial gradient background
bg = Image.new("RGBA", (W, H), (0, 0, 0, 0))
bg_draw = ImageDraw.Draw(bg)

# Background linear gradient (top-left #0d131f to bottom-right #080c14)
for y in range(H):
    r = int(12 + (y / H) * (7 - 12))
    g = int(18 + (y / H) * (11 - 18))
    b = int(28 + (y / H) * (18 - 28))
    bg_draw.line([(0, y), (W, y)], fill=(r, g, b, 255))

# Add soft radial ambient glows (teal on top-left, cyan/emerald on right behind cards)
glow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow_layer)

# Left subtle glow
cx1, cy1 = 200, 100
for rad in range(350, 0, -5):
    alpha = int(35 * (1 - rad / 350))
    glow_draw.ellipse([cx1 - rad, cy1 - rad, cx1 + rad, cy1 + rad], fill=(16, 185, 129, alpha))

# Right subtle glow (behind card showcase)
cx2, cy2 = 1000, 320
for rad in range(450, 0, -6):
    alpha = int(45 * (1 - rad / 450))
    glow_draw.ellipse([cx2 - rad, cy2 - rad, cx2 + rad, cy2 + rad], fill=(14, 165, 233, alpha))

img = Image.alpha_composite(bg, glow_layer)

# Subtle grid pattern overlay
grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
grid_draw = ImageDraw.Draw(grid)
for x in range(0, W, 40):
    grid_draw.line([(x, 0), (x, H)], fill=(255, 255, 255, 6))
for y in range(0, H, 40):
    grid_draw.line([(0, y), (W, y)], fill=(255, 255, 255, 6))
img = Image.alpha_composite(img, grid)

# Load fonts
font_dir = "C:/Windows/Fonts"
f_tag = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 14)
f_title_bold = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 50)
f_sub = ImageFont.truetype(os.path.join(font_dir, "segoeui.ttf"), 20)
f_badge = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 15)
f_footer = ImageFont.truetype(os.path.join(font_dir, "segoeui.ttf"), 15)
f_footer_bold = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 15)

draw = ImageDraw.Draw(img)

# --- LEFT COLUMN: Typography & Value Props ---
start_x = 75

# 1. Top Category Pill
pill_text = "HOME ASSISTANT CUSTOM INTEGRATION • ZERO CLOUD"
pill_bbox = draw.textbbox((0, 0), pill_text, font=f_tag)
pw = pill_bbox[2] - pill_bbox[0] + 30
ph = 32
py = 65
draw.rounded_rectangle([start_x, py, start_x + pw, py + ph], radius=16, fill=(16, 185, 129, 35), outline=(16, 185, 129, 140), width=1)
# Small glowing dot inside pill
draw.ellipse([start_x + 12, py + 11, start_x + 22, py + 21], fill=(16, 185, 129, 255))
draw.text((start_x + 30, py + 7), pill_text, font=f_tag, fill=(52, 211, 153, 255))

# 2. Main Title
title_y = py + 48
draw.text((start_x, title_y), "Xiaomi & Imilab", font=f_title_bold, fill=(255, 255, 255, 255))
draw.text((start_x, title_y + 56), "Camera Liberator", font=f_title_bold, fill=(56, 189, 248, 255))

# 3. Subtitle / Pitch
sub_y = title_y + 130
draw.text((start_x, sub_y), "Native 2K WebRTC live streaming (<200ms)", font=f_sub, fill=(226, 232, 240, 240))
draw.text((start_x, sub_y + 28), "& ultra-responsive local UDP PTZ for Home Assistant.", font=f_sub, fill=(148, 163, 184, 230))

# 4. Feature Badges (2x2 grid)
badges = [
    ("⚡ <200ms WebRTC", "Ultra-low latency streaming"),
    ("🎮 100% Local PTZ", "Zero cloud UDP control"),
    ("🔒 100% Private", "No subscriptions, firewall-safe"),
    ("📦 HACS 1-Click", "Pre-made Lovelace PTZ Card")
]

badge_y = sub_y + 80
col_w = 260
row_h = 42

for i, (b_title, b_sub) in enumerate(badges):
    bx = start_x + (i % 2) * (col_w + 14)
    by = badge_y + (i // 2) * (row_h + 14)
    draw.rounded_rectangle([bx, by, bx + col_w, by + row_h], radius=10, fill=(30, 41, 59, 150), outline=(51, 65, 85, 180), width=1)
    draw.text((bx + 14, by + 11), b_title, font=f_badge, fill=(241, 245, 249, 255))

# 5. Bottom Hardware compatibility row
foot_y = badge_y + 2 * (row_h + 14) + 25
draw.text((start_x, foot_y), "Hardware:", font=f_footer_bold, fill=(148, 163, 184, 255))
hw_text = "Xiaomi 2K • Imilab A1 • C200 / C300 / C400 • Mijia 360°"
draw.text((start_x + 85, foot_y), hw_text, font=f_footer, fill=(203, 213, 225, 230))

# --- RIGHT COLUMN: Real UI Card Showcase ---
card_path = "d:/HITOS - Víctor Antigravity/ha-chuangmi-liberator-webrtc/images/screenshot_card_full.jpg"
collapsed_path = "d:/HITOS - Víctor Antigravity/ha-chuangmi-liberator-webrtc/images/screenshot_card_collapsed.jpg"
icon_path = "d:/HITOS - Víctor Antigravity/ha-chuangmi-liberator-webrtc/images/icon_512.png"

# Load card full
if os.path.exists(card_path):
    card_img = Image.open(card_path).convert("RGBA")
    # Target height 520px
    target_h = 520
    target_w = int(card_img.width * (target_h / card_img.height))
    card_resized = card_img.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    # Create rounded corners mask
    mask = Image.new("L", (target_w, target_h), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, target_w, target_h], radius=22, fill=255)
    
    # Rounded card
    rounded_card = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    rounded_card.paste(card_resized, (0, 0), mask=mask)
    
    # Subtle border around rounded card
    border_img = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    border_draw = ImageDraw.Draw(border_img)
    border_draw.rounded_rectangle([0, 0, target_w - 1, target_h - 1], radius=22, outline=(56, 189, 248, 160), width=2)
    rounded_card = Image.alpha_composite(rounded_card, border_img)
    
    # Drop shadow behind card
    shadow_w = target_w + 60
    shadow_h = target_h + 60
    shadow = Image.new("RGBA", (shadow_w, shadow_h), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.rounded_rectangle([30, 30, 30 + target_w, 30 + target_h], radius=24, fill=(0, 0, 0, 180))
    shadow = shadow.filter(ImageFilter.GaussianBlur(25))
    
    card_x = 910
    card_y = (H - target_h) // 2
    
    img.paste(shadow, (card_x - 30, card_y - 25), shadow)
    img.paste(rounded_card, (card_x, card_y), rounded_card)

# Overlapping secondary element: Collapsed mini card preview on the left of main card
if os.path.exists(collapsed_path):
    col_img = Image.open(collapsed_path).convert("RGBA")
    col_w = 260
    col_h = int(col_img.height * (col_w / col_img.width))
    col_resized = col_img.resize((col_w, col_h), Image.Resampling.LANCZOS)
    
    c_mask = Image.new("L", (col_w, col_h), 0)
    c_mask_draw = ImageDraw.Draw(c_mask)
    c_mask_draw.rounded_rectangle([0, 0, col_w, col_h], radius=16, fill=255)
    
    rounded_col = Image.new("RGBA", (col_w, col_h), (0, 0, 0, 0))
    rounded_col.paste(col_resized, (0, 0), mask=c_mask)
    
    c_border = Image.new("RGBA", (col_w, col_h), (0, 0, 0, 0))
    c_b_draw = ImageDraw.Draw(c_border)
    c_b_draw.rounded_rectangle([0, 0, col_w - 1, col_h - 1], radius=16, outline=(16, 185, 129, 180), width=2)
    rounded_col = Image.alpha_composite(rounded_col, c_border)
    
    # Shadow for collapsed card
    c_shadow = Image.new("RGBA", (col_w + 40, col_h + 40), (0, 0, 0, 0))
    cs_draw = ImageDraw.Draw(c_shadow)
    cs_draw.rounded_rectangle([20, 20, 20 + col_w, 20 + col_h], radius=18, fill=(0, 0, 0, 200))
    c_shadow = c_shadow.filter(ImageFilter.GaussianBlur(18))
    
    col_x = 710
    col_y = 380
    
    img.paste(c_shadow, (col_x - 20, col_y - 15), c_shadow)
    img.paste(rounded_col, (col_x, col_y), rounded_col)

# Camera Icon badge overlay at top right of the collapsed card
if os.path.exists(icon_path):
    icon = Image.open(icon_path).convert("RGBA")
    icon_size = 90
    icon_resized = icon.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    
    # Circle container with glow
    icon_box = Image.new("RGBA", (icon_size + 20, icon_size + 20), (0, 0, 0, 0))
    ib_draw = ImageDraw.Draw(icon_box)
    ib_draw.ellipse([10, 10, 10 + icon_size, 10 + icon_size], fill=(15, 23, 42, 230), outline=(56, 189, 248, 220), width=2)
    
    # Icon shadow
    ib_shadow = Image.new("RGBA", (icon_size + 40, icon_size + 40), (0, 0, 0, 0))
    ibs_draw = ImageDraw.Draw(ib_shadow)
    ibs_draw.ellipse([20, 20, 20 + icon_size, 20 + icon_size], fill=(0, 0, 0, 160))
    ib_shadow = ib_shadow.filter(ImageFilter.GaussianBlur(12))
    
    ic_x = 680
    ic_y = 120
    img.paste(ib_shadow, (ic_x - 10, ic_y - 10), ib_shadow)
    img.paste(icon_box, (ic_x, ic_y), icon_box)
    img.paste(icon_resized, (ic_x + 10, ic_y + 10), icon_resized)

# Outer thin elegant border for the whole banner
final_draw = ImageDraw.Draw(img)
final_draw.rectangle([0, 0, W - 1, H - 1], outline=(51, 65, 85, 160), width=1)

# Save images
out_preview = "d:/HITOS - Víctor Antigravity/ha-chuangmi-liberator-webrtc/images/social_preview.png"
out_banner = "d:/HITOS - Víctor Antigravity/ha-chuangmi-liberator-webrtc/images/banner.png"

# Convert to RGB for best social compatibility (some unfurling bots fail on RGBA PNGs)
final_rgb = img.convert("RGB")
final_rgb.save(out_preview, format="PNG", optimize=True)
final_rgb.save(out_banner, format="PNG", optimize=True)
print("Saved successfully to:", out_preview)
