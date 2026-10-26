"""Render the existing code-native Reach mark into favicon and application icons."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
app = root / 'apps/web/src/app'
public = root / 'apps/web/public/icons'
public.mkdir(parents=True, exist_ok=True)
svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#111110"/><rect x="2" y="2" width="60" height="60" rx="13" fill="none" stroke="#55534c"/><path d="M16 45V21l16 14 16-14v24" fill="none" stroke="#efeadf" stroke-width="4" stroke-linejoin="round"/><circle cx="48" cy="21" r="5" fill="#e8743b"/></svg>'
(app / 'icon.svg').write_text(svg, encoding='utf-8')
im = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rounded_rectangle((0, 0, 1023, 1023), radius=240, fill='#111110')
d.rounded_rectangle((32, 32, 992, 992), radius=208, outline='#55534c', width=16)
d.line([(256, 720), (256, 336), (512, 560), (768, 336), (768, 720)], fill='#efeadf', width=64, joint='curve')
d.ellipse((688, 256, 848, 416), fill='#e8743b')
for size in (192, 512): im.resize((size, size), Image.Resampling.LANCZOS).save(public / f'reach-{size}.png')
im.resize((180, 180), Image.Resampling.LANCZOS).save(app / 'apple-icon.png')
im.save(app / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print('Generated Reach SVG, favicon, PNG application icons and Apple touch icon')
