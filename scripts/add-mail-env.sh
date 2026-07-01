#!/bin/bash
# ============================================================
# Script: Tambahkan MAIL_API_BASE_URL ke .env remote server
# Fitur: Kirim via Email (SDE)
# ============================================================
# 
# Jalankan di remote server 172.20.16.116:
#   ssh root@172.20.16.116 'bash -s' < scripts/add-mail-env.sh
#
# Atau copy script ini ke server lalu jalankan:
#   chmod +x add-mail-env.sh
#   ./add-mail-env.sh
# ============================================================

set -e

# Cari file .env backend (coba beberapa lokasi umum)
ENV_FILE=""
for candidate in \
  "/opt/arsipku/be/.env" \
  "/home/arsipku/be/.env" \
  "/var/www/arsipku/be/.env" \
  "$(pwd)/.env" \
  "$(dirname "$0")/../.env"; do
  if [ -f "$candidate" ]; then
    ENV_FILE="$candidate"
    break
  fi
done

if [ -z "$ENV_FILE" ]; then
  echo "ERROR: File .env tidak ditemukan."
  echo "Tentukan path manual: ENV_FILE=/path/to/.env $0"
  exit 1
fi

echo "File .env ditemukan: $ENV_FILE"

# Cek apakah MAIL_API_BASE_URL sudah ada
if grep -q "^MAIL_API_BASE_URL=" "$ENV_FILE"; then
  echo "MAIL_API_BASE_URL sudah ada di .env. Memperbarui nilai..."
  # Backup dulu
  cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  # Replace nilai lama
  sed -i 's|^MAIL_API_BASE_URL=.*|MAIL_API_BASE_URL=https://send.airnavindonesia.co.id|' "$ENV_FILE"
else
  echo "MAIL_API_BASE_URL belum ada. Menambahkan..."
  # Backup dulu
  cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  # Tambahkan di akhir file
  echo "" >> "$ENV_FILE"
  echo "# Mail Service (AirNav external email API)" >> "$ENV_FILE"
  echo "MAIL_API_BASE_URL=https://send.airnavindonesia.co.id" >> "$ENV_FILE"
fi

echo "Done. MAIL_API_BASE_URL=https://send.airnavindonesia.co.id ditambahkan ke $ENV_FILE"
echo ""
echo "Sekarang restart backend:"
echo "  pm2 restart arsipku-be"
echo "  # atau"
echo "  cd /path/to/be && npm run start:prod"
echo ""
echo "Verifikasi:"
echo "  curl -s http://localhost:3013/SDE/test-id/send-email -X POST \\"
echo "    -H 'Authorization: Bearer <jwt>' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"to\":\"test@example.com\",\"from_as\":\"ARSIPKU\"}'"
echo "  (Seharusnya tidak lagi error 'Mail API configuration is missing')"