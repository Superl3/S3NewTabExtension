from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "icons"
MASTER_SIZE = 512
TARGET_SIZES = [256, 128, 48, 32, 16]


def draw_master_icon(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    pad = int(size * 0.08)
    radius = int(size * 0.22)
    box = (pad, pad, size - pad, size - pad)

    draw.rounded_rectangle(box, radius=radius, fill=(18, 48, 106, 255))

    inner = int(size * 0.16)
    gap = int(size * 0.03)
    cell = int((size - inner * 2 - gap * 2) / 3)

    def cell_rect(col: int, row: int) -> tuple[int, int, int, int]:
        x = inner + col * (cell + gap)
        y = inner + row * (cell + gap)
        return (x, y, x + cell, y + cell)

    accent = (255, 251, 242, 255)
    muted = (196, 212, 238, 255)

    draw.rounded_rectangle(cell_rect(0, 0), radius=int(cell * 0.28), fill=accent)
    draw.rounded_rectangle(cell_rect(1, 0), radius=int(cell * 0.28), fill=muted)
    draw.rounded_rectangle(cell_rect(2, 0), radius=int(cell * 0.28), fill=accent)
    draw.rounded_rectangle(cell_rect(0, 1), radius=int(cell * 0.28), fill=muted)
    draw.rounded_rectangle(cell_rect(1, 1), radius=int(cell * 0.28), fill=accent)
    draw.rounded_rectangle(cell_rect(2, 1), radius=int(cell * 0.28), fill=muted)

    s_pad = int(size * 0.19)
    stroke = int(size * 0.08)
    draw.arc(
        (s_pad, s_pad, size - s_pad, size - s_pad),
        start=28,
        end=332,
        fill=(29, 79, 159, 255),
        width=stroke,
    )

    return image


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)

    master = draw_master_icon(MASTER_SIZE)
    master_path = ICON_DIR / "icon-512.png"
    master.save(master_path, format="PNG")
    print(f"wrote {master_path}")

    for size in TARGET_SIZES:
        target = master.resize((size, size), Image.Resampling.LANCZOS)
        path = ICON_DIR / f"icon-{size}.png"
        target.save(path, format="PNG")
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
