# Praktikum Cuaca — Cuaca Jakarta (TypeScript + Vite)

Aplikasi web yang menampilkan data prakiraan cuaca per jam dari API online
[Open-Meteo](https://open-meteo.com/) (atribut `time` dan `temperature_2m`),
dengan desain brutalis. Tugas praktikum Universitas Terbuka.

Fitur: statistik (sekarang/terendah/tertinggi/rata-rata), grafik batang per
jam, tabel per hari, filter (hari / rentang waktu / suhu), dan pencarian
kota (mulai 3 karakter) dengan zona waktu otomatis.

## Menjalankan

Prasyarat: [Node.js](https://nodejs.org/) 18+ dan koneksi internet
(data diambil langsung dari API saat halaman dibuka).

```bash
# 1. Pasang dependensi (sekali saja)
npm install

# 2. Jalankan server pengembangan
npm run dev
```

Lalu buka alamat yang muncul di terminal (default: `http://localhost:5173`).

## Build produksi

```bash
npm run build     # hasil di folder dist/
npm run preview   # pratinjau hasil build di localhost
```

## Catatan

- URL API sesuai soal tugas:
  `https://api.open-meteo.com/v1/forecast?latitude=-6.2&longitude=106.8&hourly=temperature_2m`
  (ditambah parameter `timezone=auto`; bila memilih kota lain, koordinat
  menyesuaikan hasil pencarian).
- Pencarian kota memakai [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api).
