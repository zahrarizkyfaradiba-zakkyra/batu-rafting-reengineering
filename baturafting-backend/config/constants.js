// Konstanta bersama untuk aturan bisnis Batu Rafting
module.exports = {
  SLOTS: ['08:00', '10:00', '13:00'],
  DEFAULT_CAPACITY: 50,
  PAYMENT_TYPES: ['TRANSFER', 'ONSITE'], // Transfer Bank / Bayar di Lokasi
  BOOKING_STATUSES: ['PENDING', 'PAID', 'CANCELLED'],
  PACKAGE_CATEGORIES: ['rafting', 'outbound', 'paintball', 'offroad'],
  TOKEN_TTL_SECONDS: 8 * 60 * 60 // token admin berlaku 8 jam
};
