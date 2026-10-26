#!/usr/bin/env python3
"""Buat effects/index.json dari semua file .xml di folder effects/ (jalankan setelah menyalin XML baru)."""
import os, json
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'effects')
fs = sorted(f for f in os.listdir(d) if f.lower().endswith('.xml'))
json.dump(fs, open(os.path.join(d, 'index.json'), 'w'))
print(len(fs), 'file XML terdaftar')
