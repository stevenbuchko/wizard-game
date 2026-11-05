# Shrinks the Toon Dragons textures for tools/pack-dragon.mjs, which runs it in headless Blender:
#   blender -b --python tools/dragon-textures.py -- <textures folder> <out folder>
# The cut-out wing and back pattern go as a JPEG plus a grey mask PNG: as one RGBA PNG they're four times the size.
import sys
import bpy
import numpy as np

src, out = sys.argv[sys.argv.index("--") + 1 :]

# Name: (source, size, keeps a cut-out mask)
TEXTURES = {
    "body": ("DragonBody.png", 1024, False),
    "wing": ("DragonWing.png", 1024, True),
    "pattern": ("DragonBackPattern.png", 512, True),
    "eye": ("DragonOpenEye.png", 256, False),
    "blink": ("DragonClosedEye.png", 256, False),
}

scene = bpy.context.scene
settings = scene.render.image_settings
# Plain colors out: the default view transform would grade them.
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"


def save(pixels, size, path, fmt):
    image = bpy.data.images.new("out", size, size, alpha=False)
    image.pixels.foreach_set(pixels.ravel())
    settings.file_format = fmt
    settings.color_mode = "BW" if fmt == "PNG" else "RGB"
    settings.quality = 82
    settings.compression = 100
    image.save_render(path, scene=scene)
    bpy.data.images.remove(image)


for name, (file, size, cut) in TEXTURES.items():
    image = bpy.data.images.load(f"{src}/{file}")
    image.scale(size, size)
    pixels = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(-1, 4)
    colour = pixels.copy()
    colour[:, 3] = 1
    save(colour, size, f"{out}/{name}.jpg", "JPEG")
    if cut:
        mask = np.repeat(pixels[:, 3:4], 4, axis=1)
        mask[:, 3] = 1
        save(np.where(mask > 0.5, 1.0, 0.0).astype(np.float32), size, f"{out}/{name}-mask.png", "PNG")
