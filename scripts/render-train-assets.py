"""Render Kenney's original OBJ meshes as small transparent website sprites.

Orthographic projection and flat lighting preserve the kit's low poly style.
Requires Pillow and NumPy; no 3D runtime is shipped to visitors.
Source: https://kenney.nl/assets/train-kit (CC0, see source-assets license).
"""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'source-assets' / 'kenney-train-kit'
OUT = ROOT / 'assets' / 'train'
OUT.mkdir(parents=True, exist_ok=True)
PALETTE = np.array(Image.open(SOURCE / 'colormap.png').convert('RGB'))
ELEVATION = math.radians(15)
CAMERA = np.array([-math.cos(ELEVATION), math.sin(ELEVATION), 0.0])
RIGHT = np.array([0.0, 0.0, 1.0])
UP = np.cross(CAMERA, RIGHT)
LIGHT = np.array([-0.55, 0.8, -0.25])
LIGHT /= np.linalg.norm(LIGHT)


def mesh(name, offset=(0, 0, 0)):
    vertices, texcoords, polygons = [], [], []
    for line in (SOURCE / (name + '.obj')).read_text().splitlines():
        bits = line.split()
        if not bits:
            continue
        if bits[0] == 'v':
            vertices.append([float(n) for n in bits[1:4]])
        elif bits[0] == 'vt':
            texcoords.append([float(n) for n in bits[1:3]])
        elif bits[0] == 'f':
            polygons.append([tuple(int(n) - 1 if n else 0 for n in part.split('/')) for part in bits[1:]])
    vertices = np.array(vertices) + np.array(offset)
    faces = []
    for polygon in polygons:
        points = vertices[[item[0] for item in polygon]]
        normal = np.cross(points[1] - points[0], points[2] - points[0])
        length = np.linalg.norm(normal)
        if length < 1e-8:
            continue
        normal /= length
        if np.dot(normal, CAMERA) <= 1e-7:
            continue
        uv = np.array([texcoords[item[1]] for item in polygon])
        shade = 0.71 + 0.29 * max(0, np.dot(normal, LIGHT))
        projected = np.stack([points @ RIGHT, -(points @ UP)], axis=1)
        faces.append((points @ CAMERA, projected, uv, shade))
    return faces


def render(faces, filename, width, height=None, padding=10):
    all_points = np.concatenate([face[1] for face in faces])
    low, high = all_points.min(axis=0), all_points.max(axis=0)
    scale = (width - padding * 2) / (high[0] - low[0])
    height = height or round((high[1] - low[1]) * scale + padding * 2)
    pixels_out = np.zeros((height, width, 4), dtype=np.uint8)
    z_buffer = np.full((height, width), -np.inf)
    for depths, points, uvs, shade in faces:
        pixels = (points - low) * scale + padding
        for index in range(1, len(points) - 1):
            indices = [0, index, index + 1]
            tri = pixels[indices]
            a, b, c = tri
            denominator = (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1])
            if abs(denominator) < 1e-8:
                continue
            x0, y0 = np.maximum(0, np.floor(tri.min(axis=0)).astype(int))
            x1, y1 = np.minimum([width-1, height-1], np.ceil(tri.max(axis=0)).astype(int))
            if x0 > x1 or y0 > y1:
                continue
            yy, xx = np.mgrid[y0:y1+1, x0:x1+1]
            x, y = xx + .5, yy + .5
            wa = ((b[1]-c[1])*(x-c[0]) + (c[0]-b[0])*(y-c[1]))/denominator
            wb = ((c[1]-a[1])*(x-c[0]) + (a[0]-c[0])*(y-c[1]))/denominator
            wc = 1-wa-wb
            depth = wa*depths[indices[0]] + wb*depths[indices[1]] + wc*depths[indices[2]]
            visible = (wa >= -1e-6) & (wb >= -1e-6) & (wc >= -1e-6) & (depth >= z_buffer[yy, xx])
            if not visible.any():
                continue
            uv = wa[..., None]*uvs[indices[0]] + wb[..., None]*uvs[indices[1]] + wc[..., None]*uvs[indices[2]]
            tx = np.clip((uv[..., 0]*PALETTE.shape[1]).astype(int), 0, PALETTE.shape[1]-1)
            ty = np.clip(((1-uv[..., 1])*PALETTE.shape[0]).astype(int), 0, PALETTE.shape[0]-1)
            colors = np.clip(PALETTE[ty, tx]*shade, 0, 255).astype(np.uint8)
            pixels_out[yy[visible], xx[visible], :3] = colors[visible]
            pixels_out[yy[visible], xx[visible], 3] = 255
            z_buffer[yy[visible], xx[visible]] = depth[visible]
    image = Image.fromarray(pixels_out, 'RGBA')
    image.save(OUT / filename, 'WEBP', lossless=True)
    print(filename, image.size, (OUT / filename).stat().st_size, 'bytes')


train = mesh('train-diesel-a', (0, .11, 2.65))
train += mesh('train-locomotive-passenger-a', (0, .11, 0))
train += mesh('train-locomotive-passenger-a', (0, .11, -2.65))
render(train, 'passenger-train.webp', 1800)
# At the same camera angle, the rail tile joins without a vertical seam.
render(mesh('railroad-straight'), 'rail-tile.webp', 800, padding=0)
