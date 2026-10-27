# Uji engine native: CRC vs zlib, GIF vs dekoder PIL. Pakai: g++ -O2 -shared -fPIC -o libml.so engine.cpp && python3 test_engine.py ./libml.so
import ctypes, sys, zlib, os, io, random
from PIL import Image
L = ctypes.CDLL(sys.argv[1] if len(sys.argv) > 1 else './libml.so')
L.ml_crc32.restype = ctypes.c_uint32
L.ml_crc32.argtypes = [ctypes.c_uint32, ctypes.c_char_p, ctypes.c_uint32]
L.ml_gif_data.restype = ctypes.POINTER(ctypes.c_uint8)
L.ml_gif_size.restype = ctypes.c_uint32
L.ml_gif_frame.argtypes = [ctypes.c_char_p]
for n in (0, 1, 7, 8, 9, 1000, 1 << 20):
    d = os.urandom(n)
    assert L.ml_crc32(0, d, n) == zlib.crc32(d), n
    c = L.ml_crc32(0, d[: n // 2], n // 2); c = L.ml_crc32(c, d[n // 2:], n - n // 2)
    assert c == zlib.crc32(d), 'chunk'
assert L.ml_crc32(0, b'123456789', 9) == 0xCBF43926
print('CRC ok')

def q(r, g, b):  # kuantisasi 3-3-2 sama dengan palet engine
    return (r & 0xE0) | ((g & 0xE0) >> 3) | (b >> 6)
def pal(i): return ((i >> 5 & 7) * 255 // 7, (i >> 2 & 7) * 255 // 7, (i & 3) * 255 // 3)

def run(W, H, nframes, tr, noisy):
    random.seed(W * H + nframes)
    frames = []
    for k in range(nframes):
        b = bytearray()
        for y in range(H):
            for x in range(W):
                if noisy: r, g, bl = random.randrange(256), random.randrange(256), random.randrange(256)
                else: r, g, bl = (x * 255 // max(W - 1, 1) + k * 9) & 255, y * 255 // max(H - 1, 1), (x ^ y) & 255
                a = 0 if (tr and (x + y) % 5 == 0) else 255
                b += bytes((r, g, bl, a))
        frames.append(bytes(b))
    L.ml_gif_begin(W, H, 4, 1 if tr else 0)
    for f in frames: L.ml_gif_frame(f)
    L.ml_gif_end()
    data = bytes(L.ml_gif_data()[: L.ml_gif_size()])
    im = Image.open(io.BytesIO(data)); assert im.n_frames == nframes, (im.n_frames, nframes)
    for k, f in enumerate(frames):
        im.seek(k); got = im.convert('RGBA'); bad = 0
        for i in range(W * H):
            r, g, b_, a = f[i * 4: i * 4 + 4]
            if tr and a < 128: exp = (0, 0, 0, 0)
            else:
                v = q(r, g, b_)
                if tr and v == 0: v = 1
                exp = pal(v) + (255,)
            if got.getpixel((i % W, i // W)) != exp: bad += 1
        assert bad == 0, (W, H, k, tr, noisy, 'piksel salah', bad)
    return len(data)
for args in [(16, 16, 2, False, False), (64, 48, 3, True, False), (120, 90, 2, False, True), (200, 150, 2, True, True)]:
    print('GIF ok', args, run(*args), 'byte')
