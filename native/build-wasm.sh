#!/usr/bin/env bash
# Kompilasi engine C++ -> WebAssembly. Butuh Emscripten (emcc). Hasil: engine/motionlyn_engine.wasm
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p engine
emcc native/engine.cpp -O3 -fno-exceptions -fno-rtti --no-entry \
  -sSTANDALONE_WASM=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 -sMALLOC=emmalloc \
  -sEXPORTED_FUNCTIONS=_ml_alloc,_ml_free,_ml_crc32,_ml_gif_begin,_ml_gif_frame,_ml_gif_end,_ml_gif_data,_ml_gif_size,_ml_gif_free \
  -o engine/motionlyn_engine.wasm
ls -l engine/motionlyn_engine.wasm
