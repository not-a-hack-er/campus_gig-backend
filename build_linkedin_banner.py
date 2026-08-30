"""
CampusVault — Stylish Bold + Premium Dark Mode Master Banner Builder
Keeps ALL content 100% identical (Logo, Headline, QR Code, Phone UI, Feature Pillars).
Swaps the visual style to the sleek, stylish, bold + premium dark obsidian theme with electric violet & cyan gradient aura lighting.
"""

import math
import qrcode
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── Canvas 1200x675 (16:9 Aspect Ratio) ──────────────────────────────────────
W, H = 1200, 675
canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))

# ── Background: Deep Dark Obsidian Slate with Electric Violet & Cyan Aura Glow ─
bg = Image.new("RGBA", (W, H), "#080B14")

# Curved ambient backdrop glow
glow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow_layer)

# Deep Indigo/Violet aura on right behind phone
for i in range(160, 0, -1):
    alpha = int(140 * (i / 160) ** 2)
    r1 = int(140 + (160 - i) * 5)
    r2 = int(100 + (160 - i) * 4)
    gd.ellipse(
        [W - r1 - 80, H - r2 - 20, W + r1, H + r2 + 60],
        fill=(99, 102, 241, alpha),
    )

# Neon Magenta/Pink aura top-center
for i in range(110, 0, -1):
    alpha = int(110 * (i / 110) ** 2)
    r = int(80 + (110 - i) * 5)
    gd.ellipse([W // 2 - 50 - r, -r // 2 - 40, W // 2 - 50 + r, r // 2 + 100], fill=(236, 72, 153, alpha))

# Cyan ambient glow bottom-left under QR card
for i in range(100, 0, -1):
    alpha = int(90 * (i / 100) ** 2)
    r = int(60 + (100 - i) * 4)
    gd.ellipse([-r // 2, H - r, r, H + r // 2], fill=(6, 182, 212, alpha))

blurred_glow = glow_layer.filter(ImageFilter.GaussianBlur(radius=65))
bg.alpha_composite(blurred_glow)
canvas.alpha_composite(bg)

draw_c = ImageDraw.Draw(canvas)

# ── Font Loader ───────────────────────────────────────────────────────────────
def load_font(size, bold=False):
    try:
        if bold:
            return ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", size)
        return ImageFont.truetype("C:/Windows/Fonts/arial.ttf", size)
    except:
        return ImageFont.load_default()

font_brand    = load_font(28, bold=True)
font_brand_v  = load_font(28, bold=True)
font_headline = load_font(46, bold=True)
font_sub      = load_font(15)
font_feature  = load_font(17, bold=True)
font_feature2 = load_font(15)
font_cta      = load_font(13, bold=True)
font_small    = load_font(12, bold=True)

# ── Helper: Rounded rectangle ─────────────────────────────────────────────────
def rounded_rect(img_draw, xy, radius, fill, outline=None, width=1):
    img_draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)

# ── RENDER OFFICIAL CAMPUSVAULT LOGO BADGE ────────────────────────────────────
def draw_v_logo(size=56):
    """
    Official V Logo:
    Dark rounded square (#121220 / #2E2A52 border) with two angled arms forming a sleek 'V'.
    Left arm: Indigo (#818CF8), Right arm: Purple (#C084FC).
    """
    badge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(badge)
    
    bd.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.24), fill="#121220", outline="#3B3765", width=1)
    stroke_w = max(3, int(size * 0.11))
    
    # Left arm (indigo gradient)
    bd.line([int(size * 0.28), int(size * 0.28), int(size * 0.47), int(size * 0.72)], fill="#818CF8", width=stroke_w)
    # Right arm (purple gradient)
    bd.line([int(size * 0.72), int(size * 0.28), int(size * 0.53), int(size * 0.72)], fill="#C084FC", width=stroke_w)
    
    return badge

logo_badge = draw_v_logo(54)
canvas.alpha_composite(logo_badge, (36, 30))

# Logo Text: "Campus" (Crisp White) + "Vault" (Purple Accent)
draw_c.text((102, 38), "Campus", font=font_brand, fill="#FFFFFF")
draw_c.text((208, 38), "Vault", font=font_brand_v, fill="#A855F7")

# ── Beta Waitlist Pill Badge ──────────────────────────────────────────────────
pill_text = "✨  PRIVATE BETA WAITLIST IS OPEN"
pill_x, pill_y = 36, 98
rounded_rect(draw_c, [pill_x, pill_y, pill_x + 270, pill_y + 26], radius=13, fill="#F43F5E")
draw_c.text((pill_x + 14, pill_y + 5), pill_text, font=font_small, fill="white")

# ── Main Headline ─────────────────────────────────────────────────────────────
draw_c.text((36, 136), "NO MORE", font=font_headline, fill="#FFFFFF")
draw_c.text((36, 190), "WHATSAPP GROUP", font=font_headline, fill="#FFFFFF")
draw_c.text((36, 244), "CHAOS.", font=font_headline, fill="#F43F5E")

# ── Sub-headline ─────────────────────────────────────────────────────────────
draw_c.text((36, 306), "CampusVault — Peer-to-Peer Campus Marketplace", font=font_sub, fill="#94A3B8")

# ── Feature Pillars ───────────────────────────────────────────────────────────
features = [
    ("⚡", "Real-Time Socket.IO Chat"),
    ("🔒", "Atomic Gig Claims (Zero Ghosting)"),
    ("⭐", "Verified Student Ratings"),
]
fy = 342
for icon, text in features:
    draw_c.text((36, fy), icon, font=font_feature, fill="#A855F7")
    draw_c.text((75, fy + 2), text, font=font_feature2, fill="#F8FAFC")
    fy += 34

# ── CLEAN SOLID WHITE QR CARD (NO DUPLICATE / BROKEN PLACEHOLDERS) ────────────
qr_url = "https://docs.google.com/forms/d/1NWO0_ITcPe4IpPTIQPTVNP2imPqxe2ZY6snpKvdgrbM/viewform"
qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=6, border=1)
qr.add_data(qr_url)
qr.make(fit=True)
qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")

card_x, card_y = 36, 465
card_w, card_h = 190, 185

# Glowing drop shadow for dark mode
shadow = Image.new("RGBA", (card_w + 14, card_h + 14), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
rounded_rect(sd, [4, 4, card_w + 4, card_h + 4], radius=16, fill=(168, 85, 247, 80))
shadow_blurred = shadow.filter(ImageFilter.GaussianBlur(radius=8))
canvas.alpha_composite(shadow_blurred, (card_x - 3, card_y - 3))

# Solid clean white background card
rounded_rect(draw_c, [card_x, card_y, card_x + card_w, card_y + card_h], radius=16, fill="white", outline="#38305B", width=1)

# Header label
draw_c.text((card_x + 18, card_y + 12), "SCAN FOR BETA ACCESS", font=font_cta, fill="#6366F1")

# Clean 100% Real Scannable QR Code centered inside the card
qr_size = 142
qr_img_resized = qr_img.resize((qr_size, qr_size), Image.Resampling.LANCZOS)
canvas.alpha_composite(qr_img_resized, (card_x + 24, card_y + 34))

# ── PHONE MOCKUP (STYLISH DARK MODE HOMESCREEN MOCKUP) ────────────────────────
px, py = 640, 24
pw, ph = 330, 625

phone = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
pd = ImageDraw.Draw(phone)

# Outer phone body shadow glow
p_shadow = Image.new("RGBA", (pw + 24, ph + 24), (0, 0, 0, 0))
psd = ImageDraw.Draw(p_shadow)
rounded_rect(psd, [12, 12, pw + 12, ph + 12], radius=38, fill=(99, 102, 241, 100))
p_shadow_blurred = p_shadow.filter(ImageFilter.GaussianBlur(radius=14))
canvas.alpha_composite(p_shadow_blurred, (px - 6, py - 6))

# Outer phone body frame
rounded_rect(pd, [0, 0, pw, ph], radius=36, fill="#181826", outline="#4F46E5", width=2)
# Inner screen background (#0B0B14 dark mode)
rounded_rect(pd, [8, 12, pw - 8, ph - 12], radius=28, fill="#0B0B14")

# Camera punch hole
pd.ellipse([pw // 2 - 6, 18, pw // 2 + 6, 30], fill="#000000")

# --- PHONE APP HEADER BAR ---
mini_v = draw_v_logo(24)
phone.alpha_composite(mini_v, (20, 42))
pd.text((50, 45), "CampusVault", font=load_font(13, bold=True), fill="#F8FAFC")

# Search, Theme, Bell icons
pd.text((pw - 75, 45), "🔍", font=load_font(11), fill="#94A3B8")
pd.text((pw - 50, 45), "☀️", font=load_font(11), fill="#94A3B8")
pd.text((pw - 28, 45), "🔔", font=load_font(11), fill="#94A3B8")
pd.ellipse([pw - 20, 45, pw - 15, 50], fill="#EF4444")

# --- GREETING & QUICK STATS CARDS ---
pd.text((20, 78), "Good morning, Student! 👋", font=load_font(14, bold=True), fill="#F8FAFC")
pd.text((20, 98), "3 new gigs match your skills", font=load_font(10), fill="#94A3B8")

# 3 Quick Stat Cards
rounded_rect(pd, [20, 118, 105, 160], radius=10, fill="#161626", outline="#252438", width=1)
pd.text((28, 124), "💼", font=load_font(11), fill="#38BDF8")
pd.text((28, 140), "1 Active", font=load_font(10, bold=True), fill="#F8FAFC")

rounded_rect(pd, [115, 118, 200, 160], radius=10, fill="#161626", outline="#252438", width=1)
pd.text((123, 124), "👥", font=load_font(11), fill="#4ADE80")
pd.text((123, 140), "0 Done", font=load_font(10, bold=True), fill="#F8FAFC")

rounded_rect(pd, [210, 118, 295, 160], radius=10, fill="#161626", outline="#252438", width=1)
pd.text((218, 124), "⭐", font=load_font(11), fill="#FBBF24")
pd.text((218, 140), "4.9 ★", font=load_font(10, bold=True), fill="#F8FAFC")

# --- SEARCH BAR ---
rounded_rect(pd, [20, 172, pw - 20, 204], radius=16, fill="#141424", outline="#222136", width=1)
pd.text((32, 182), "🔍  Search gigs, skills, peers...", font=load_font(10), fill="#64748B")

# --- CATEGORY CHIPS ---
chips = [("All", True), ("Coding", False), ("Design", False), ("Writing", False), ("Tutoring", False)]
cx = 20
for chip_label, is_selected in chips:
    tw = len(chip_label) * 6 + 16
    if is_selected:
        rounded_rect(pd, [cx, 214, cx + tw, 236], radius=11, fill="#4338CA", outline="#6366F1", width=1)
        pd.text((cx + 8, 218), chip_label, font=load_font(10, bold=True), fill="white")
    else:
        rounded_rect(pd, [cx, 214, cx + tw, 236], radius=11, fill="#141424", outline="#222136", width=1)
        pd.text((cx + 8, 218), chip_label, font=load_font(10), fill="#94A3B8")
    cx += tw + 6

# --- FEATURED GIG CARD (INDIGO GRADIENT CARD FROM REAL APP) ---
pd.text((20, 248), "FEATURED GIGS", font=load_font(9, bold=True), fill="#64748B")

feat_card = Image.new("RGBA", (pw - 40, 118), (0, 0, 0, 0))
fcd = ImageDraw.Draw(feat_card)

for i in range(pw - 40):
    t = i / (pw - 40)
    r = int(49 + (88 - 49) * t)
    g = int(46 + (28 - 46) * t)
    b = int(129 + (200 - 129) * t)
    fcd.line([(i, 0), (i, 118)], fill=(r, g, b, 255))

fmask = Image.new("L", (pw - 40, 118), 0)
fmd = ImageDraw.Draw(fmask)
fmd.rounded_rectangle([0, 0, pw - 40, 118], radius=14, fill=255)
feat_card.putalpha(fmask)
phone.alpha_composite(feat_card, (20, 262))

pd.text((32, 272), "FEATURED", font=load_font(8, bold=True), fill="#C7D2FE")
pd.text((pw - 70, 272), "Coding", font=load_font(9, bold=True), fill="#E0E7FF")

pd.text((32, 290), "Build Real-Time Chat Engine", font=load_font(13, bold=True), fill="white")
pd.text((32, 310), "for Campus App", font=load_font(12, bold=True), fill="#E0E7FF")

rounded_rect(pd, [32, 332, 85, 350], radius=9, fill="#312E81")
pd.text((40, 334), "₹1,000", font=load_font(10, bold=True), fill="#A5B4FC")

pd.text((95, 335), "by Student Developer", font=load_font(9), fill="#C7D2FE")

rounded_rect(pd, [pw - 100, 330, pw - 32, 352], radius=11, fill="white")
pd.text((pw - 92, 334), "View Gig →", font=load_font(9, bold=True), fill="#312E81")

# --- RECOMMENDED SECTION ---
pd.text((20, 392), "Recommended for You", font=load_font(11, bold=True), fill="#F8FAFC")
pd.text((pw - 60, 393), "See all →", font=load_font(9), fill="#818CF8")

rounded_rect(pd, [20, 412, pw - 20, 482], radius=14, fill="#121220", outline="#222136", width=1)
pd.text((32, 422), "< > Coding", font=load_font(9, bold=True), fill="#818CF8")
pd.text((pw - 75, 422), "15h ago", font=load_font(9), fill="#64748B")
pd.text((32, 438), "Figma UI/UX Design & Prototype", font=load_font(11, bold=True), fill="#F8FAFC")

rounded_rect(pd, [32, 458, 80, 474], radius=6, fill="#1E1B4B")
pd.text((38, 460), "kotlin", font=load_font(9), fill="#A5B4FC")

rounded_rect(pd, [86, 458, 175, 474], radius=6, fill="#1E1B4B")
pd.text((92, 460), "jetpack compose", font=load_font(9), fill="#A5B4FC")

pd.text((pw - 65, 456), "₹1,500", font=load_font(11, bold=True), fill="#4ADE80")

# --- BOTTOM NAVIGATION BAR ---
nav_y = ph - 62
pd.rectangle([8, nav_y, pw - 8, ph - 12], fill="#0D0D18")
pd.line([(8, nav_y), (pw - 8, nav_y)], fill="#1E1B4B", width=1)

pd.text((32, nav_y + 8), "🏠", font=load_font(12), fill="#818CF8")
pd.text((30, nav_y + 24), "Home", font=load_font(8, bold=True), fill="#818CF8")

pd.text((90, nav_y + 8), "💼", font=load_font(12), fill="#64748B")
pd.text((88, nav_y + 24), "Gigs", font=load_font(8), fill="#64748B")

pd.ellipse([pw // 2 - 18, nav_y + 2, pw // 2 + 18, nav_y + 38], fill="#6366F1")
pd.text((pw // 2 - 7, nav_y + 7), "+", font=load_font(18, bold=True), fill="white")

pd.text((pw - 102, nav_y + 8), "💬", font=load_font(12), fill="#64748B")
pd.text((pw - 112, nav_y + 24), "Messages", font=load_font(8), fill="#64748B")

pd.text((pw - 42, nav_y + 8), "👤", font=load_font(12), fill="#64748B")
pd.text((pw - 46, nav_y + 24), "Profile", font=load_font(8), fill="#64748B")

canvas.alpha_composite(phone, (px, py))

# ── Save Final Outputs ────────────────────────────────────────────────────────
out_rgb = canvas.convert("RGB")
path_main = r"c:\Users\akars\OneDrive\Desktop\campus_gig backend\day2_campusvault_linkedin_post_image.png"
path_brain = r"C:\Users\akars\.gemini\antigravity-ide\brain\6a9ec7d5-08cb-4bbe-91a3-d7a60e41eacf\campusvault_stylish_dark_banner.png"

out_rgb.save(path_main, quality=98)
out_rgb.save(path_brain, quality=98)

print("SUCCESS: Stylish Bold + Premium Dark Mode LinkedIn banner built and saved!")
print("   -> " + path_main)
