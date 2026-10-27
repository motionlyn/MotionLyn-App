// MotionLyn Engine (C++) — dikompilasi ke WebAssembly agar jalan di dalam WebView/browser tanpa
// biaya jembatan JS<->Java. Isi: CRC-32 cepat (slicing-by-8) dan encoder GIF (LZW + tabel hash).
// Keluaran GIF identik dengan encoder JS lama (palet 3-3-2 tetap), hanya jauh lebih cepat.
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define ML_EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define ML_EXPORT extern "C"
#endif

// ---------- memori ----------
ML_EXPORT uint8_t* ml_alloc(uint32_t n) { return (uint8_t*)malloc(n ? n : 1); }
ML_EXPORT void ml_free(uint8_t* p) { free(p); }

// ---------- CRC-32 (sama dengan zlib.crc32) ----------
static uint32_t T[8][256];
static bool tReady = false;
static void initTables() {
  for (uint32_t n = 0; n < 256; n++) {
    uint32_t c = n;
    for (int k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1;
    T[0][n] = c;
  }
  for (uint32_t n = 0; n < 256; n++) {
    uint32_t c = T[0][n];
    for (int k = 1; k < 8; k++) { c = T[0][c & 255] ^ (c >> 8); T[k][n] = c; }
  }
  tReady = true;
}
/** crc awal 0; hasil bisa dipakai lagi sebagai crc awal untuk potongan berikutnya */
ML_EXPORT uint32_t ml_crc32(uint32_t crc, const uint8_t* p, uint32_t n) {
  if (!tReady) initTables();
  uint32_t c = ~crc;
  while (n >= 8) {
    uint32_t a, b;
    memcpy(&a, p, 4); memcpy(&b, p + 4, 4);
    a ^= c;
    c = T[7][a & 255] ^ T[6][(a >> 8) & 255] ^ T[5][(a >> 16) & 255] ^ T[4][a >> 24] ^
        T[3][b & 255] ^ T[2][(b >> 8) & 255] ^ T[1][(b >> 16) & 255] ^ T[0][b >> 24];
    p += 8; n -= 8;
  }
  while (n--) c = T[0][(c ^ *p++) & 255] ^ (c >> 8);
  return ~c;
}

// ---------- GIF ----------
namespace {
struct Gif {
  int W = 0, H = 0, delay = 0;
  bool tr = false;
  std::vector<uint8_t> out;
} G;

uint32_t hKey[8192];
uint16_t hVal[8192];

inline void put(std::vector<uint8_t>& o, int a) { o.push_back((uint8_t)a); }
}  // namespace

ML_EXPORT void ml_gif_begin(int W, int H, int delay, int tr) {
  G.W = W; G.H = H; G.delay = delay; G.tr = tr != 0;
  G.out.clear();
  const char* sig = "GIF89a";
  for (int i = 0; i < 6; i++) put(G.out, sig[i]);
  put(G.out, W & 255); put(G.out, W >> 8); put(G.out, H & 255); put(G.out, H >> 8);
  put(G.out, 0xF7); put(G.out, 0); put(G.out, 0);
  for (int i = 0; i < 256; i++) {  // palet 3-3-2
    put(G.out, ((i >> 5) & 7) * 255 / 7);
    put(G.out, ((i >> 2) & 7) * 255 / 7);
    put(G.out, (i & 3) * 255 / 3);
  }
  put(G.out, 0x21); put(G.out, 0xFF); put(G.out, 11);
  const char* ns = "NETSCAPE2.0";
  for (int i = 0; i < 11; i++) put(G.out, ns[i]);
  put(G.out, 3); put(G.out, 1); put(G.out, 0); put(G.out, 0); put(G.out, 0);
}

/** rgba: W*H*4 byte */
ML_EXPORT void ml_gif_frame(const uint8_t* f) {
  const int W = G.W, H = G.H;
  const bool tr = G.tr;
  std::vector<uint8_t>& o = G.out;
  const int hdr[] = {0x21, 0xF9, 4, tr ? 9 : 0, G.delay & 255, G.delay >> 8, 0, 0,
                     0x2C, 0, 0, 0, 0, W & 255, W >> 8, H & 255, H >> 8, 0, 8};
  for (int v : hdr) put(o, v);

  std::vector<uint8_t> by;
  by.reserve((size_t)W * H / 2 + 1024);
  uint32_t cur = 0; int nb = 0, size = 9, next = 258;
  memset(hKey, 0, sizeof(hKey));

  auto emit = [&](int c) {
    cur |= (uint32_t)c << nb; nb += size;
    while (nb >= 8) { by.push_back(cur & 255); cur >>= 8; nb -= 8; }
  };
  auto px = [&](size_t i) -> int {
    const uint8_t* q = f + i * 4;
    if (tr && q[3] < 128) return 0;
    int v = (q[0] & 0xE0) | ((q[1] & 0xE0) >> 3) | (q[2] >> 6);
    return (tr && !v) ? 1 : v;
  };

  const size_t total = (size_t)W * H;
  emit(256);
  int p = px(0);
  for (size_t i = 1; i < total; i++) {
    int c = px(i);
    uint32_t key = (uint32_t)p * 256u + (uint32_t)c + 1u;
    uint32_t h = (key * 2654435761u) >> 19;  // 13 bit
    int found = -1;
    while (hKey[h]) {
      if (hKey[h] == key) { found = hVal[h]; break; }
      h = (h + 1) & 8191;
    }
    if (found >= 0) { p = found; continue; }
    emit(p);
    if (next < 4096) {
      hKey[h] = key; hVal[h] = (uint16_t)next++;
      if (next > (1 << size) && size < 12) size++;
    } else {
      emit(256); memset(hKey, 0, sizeof(hKey)); size = 9; next = 258;
    }
    p = c;
  }
  emit(p); emit(257);
  if (nb > 0) by.push_back(cur & 255);

  for (size_t i = 0; i < by.size(); i += 255) {
    size_t n = by.size() - i < 255 ? by.size() - i : 255;
    put(o, (int)n);
    o.insert(o.end(), by.begin() + i, by.begin() + i + n);
  }
  put(o, 0);
}

ML_EXPORT void ml_gif_end() { put(G.out, 0x3B); }
ML_EXPORT const uint8_t* ml_gif_data() { return G.out.data(); }
ML_EXPORT uint32_t ml_gif_size() { return (uint32_t)G.out.size(); }
ML_EXPORT void ml_gif_free() { std::vector<uint8_t>().swap(G.out); }
