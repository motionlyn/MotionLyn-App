# MotionLyn (App) · v0.5.1 beta

Repo ini membangun APK lewat GitHub Actions (`.github/workflows/build.yml`): file web (`index.html`, `css`, `js`, `img`, `am`, `effects`)
disalin ke `android/app/src/main/assets`, lalu `gradle assembleRelease`. Hasil ada di **Actions → artifact** dan **Releases**.

## Yang baru di v0.5.1
- **Folder simpan APK: `Download/MotionLynApp`** (versi web: `Download/MotionLynWeb`).
- **Nama file baru** (web & app sama): `MotionLynV-NAMA[kode].mp4`, `MotionLynML-…ml`, `MotionLynXML-…xml`, `MotionLynPNG-…png`,
  `MotionLynJPG-…jpg`, `MotionLynGIF-…gif`, `MotionLynUGP-…zip` (urutan gambar PNG), dan downloader AIO: `MotionLyn AIO-NAMA_ATAU_CAPTION[kode].mp3/mp4/png`.
- Jembatan native Mode Hyper (`HyperNative.java`): wake lock CPU + sustained performance, dipanggil dari `engine_hyper_aktif.js`.
- versionName `0.5.1 beta`, versionCode `501`.

## Penting bila kamu punya kode Java yang LEBIH BARU dari zip ini
Java di sini berasal dari repo v3.89 yang kamu kirim (ditambah perubahan v0.5.1). Kalau repo aslimu sudah punya
`MainActivity.java` / `HyperNative.java` yang lebih baru, **jangan menimpanya**; cukup terapkan `PATCH-ANDROID.txt`.
