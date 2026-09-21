#!/usr/bin/env python3
"""
生成 PoC 用的「已完成构图的设计图」(1920x1080 PNG)。
这不是产品功能，只是为了给图片局部动画提供一个真实的测试输入：
图上同时包含标题、关键词、卡片、UI 按钮、手绘线条、装饰元素。

用法: python3 tools/make-sample-design.py
"""

import math
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
FONT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "fonts", "NotoSansSC-VF.ttf")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "sample-design.png")

INK = (15, 46, 42)
PANEL = (22, 56, 47)
PANEL_STROKE = (42, 92, 80)
CREAM = (244, 239, 230)
MUTED = (168, 196, 188)
BRAND = (111, 168, 155)
AMBER = (232, 163, 61)
AMBER_TEXT = (255, 216, 168)


def font(size: int, weight: int = 400) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(FONT_PATH, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def tracked(draw: ImageDraw.ImageDraw, xy, text, f, fill, spacing=6):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=f, fill=fill)
        x += draw.textlength(ch, font=f) + spacing
    return x


def hand_line(draw: ImageDraw.ImageDraw, x0, y0, x1, y1, fill, width=6, amp=5, steps=64):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + math.sin(t * math.pi * 3) * amp * (1 - t * 0.6)))
    draw.line(pts, fill=fill, width=width, joint="curve")


def main():
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)

    d.ellipse((1746, 118, 1782, 154), fill=AMBER)
    d.ellipse((1806, 172, 1826, 192), fill=BRAND)

    tracked(d, (120, 118), "CHENSTRICKS  MOTION", font(26, 500), BRAND, spacing=8)

    d.text((112, 214), "一个麻烦", font=font(132, 700), fill=CREAM)
    d.text((118, 386), "先行动，再优化", font=font(56, 400), fill=MUTED)

    d.rounded_rectangle((118, 496, 512, 626), radius=24, fill=PANEL, outline=PANEL_STROKE, width=3)
    d.text((152, 526), "先行动", font=font(72, 700), fill=AMBER_TEXT)

    hand_line(d, 140, 654, 492, 646, AMBER, width=7, amp=6)

    d.rounded_rectangle((1080, 292, 1800, 812), radius=36, fill=PANEL, outline=PANEL_STROKE, width=3)
    d.text((1124, 340), "它怎么工作", font=font(42, 500), fill=BRAND)

    rows = [("1", "搜索 → 答案", "查完就结束了"), ("2", "回答 → 新问题", "从答案里长出问题"), ("3", "继续问", "越聊越清楚")]
    y = 440
    for num, title, sub in rows:
        d.ellipse((1124, y + 8, 1176, y + 60), outline=AMBER, width=3)
        d.text((1138, y + 16), num, font=font(30, 500), fill=AMBER)
        d.text((1204, y), title, font=font(48, 500), fill=CREAM)
        d.text((1204, y + 62), sub, font=font(30, 400), fill=MUTED)
        y += 120
        if num != "3":
            d.line((1124, y - 26, 1756, y - 26), fill=(38, 82, 71), width=2)

    d.rounded_rectangle((1080, 862, 1370, 962), radius=50, fill=AMBER)
    d.text((1160, 884), "开始", font=font(46, 700), fill=(26, 26, 26))

    d.text((1080, 1000), "chenstricks Motion · 测试用图", font=font(26, 400), fill=(74, 116, 106))
    d.line((120, 1000, 900, 1000), fill=(38, 82, 71), width=2)

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    img.save(OUT_PATH, format="PNG", optimize=True)
    print("wrote", os.path.abspath(OUT_PATH), os.path.getsize(OUT_PATH), "bytes")


if __name__ == "__main__":
    main()
