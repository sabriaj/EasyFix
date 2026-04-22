export function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

export function hasText(value, min = 1, max = Infinity) {
  const s = String(value || "").trim();
  return s.length >= min && s.length <= max;
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export function isValidObjectId(mongoose, value) {
  return mongoose.isValidObjectId(String(value || "").trim());
}

export function validateNameLike(value) {
  return hasText(value, 2, 80);
}

export function validateAddressLike(value) {
  return hasText(value, 1, 200);
}

export function validatePasswordValue(value) {
  const s = String(value || "");
  return s.length >= 6 && s.length <= 200;
}

export function validateDescriptionValue(value) {
  return String(value || "").trim().length <= 1000;
}
