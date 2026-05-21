import { supabase } from './supabaseClient';
import CryptoJS from 'crypto-js';

export const ACCESS_MODE = {
  ADMIN: 'admin',
  RECEPTION: 'reception',
};

const ACCESS_MODE_KEY = 'hmg_access_mode';
const PBKDF2_ITERATIONS = 150000;
const PBKDF2_KEY_LENGTH_BYTES = 32;

// Security review: reception access includes the onboarding flow that Layout can route into
// before the main dashboard is available.
export const RECEPTION_ALLOWED_ROUTES = [
  '/dashboard',
  '/billing',
  '/onboarding-migration',
  '/auto-migration',
  '/customers',
  '/trainers',
  '/transactions',
  '/communications',
  '/integrations',
];

export const getAccessMode = () => sessionStorage.getItem(ACCESS_MODE_KEY);

export const setAccessMode = (mode) => {
  sessionStorage.setItem(ACCESS_MODE_KEY, mode);
};

export const clearAccessMode = () => {
  sessionStorage.removeItem(ACCESS_MODE_KEY);
};

const isValidHex = (hex) => typeof hex === 'string' && hex.length > 0 && hex.length % 2 === 0 && /^[0-9a-f]+$/i.test(hex);

const generateSaltHex = () => {
  return CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex);
};

const hashPassword = async (password, saltHex) => {
  if (!isValidHex(saltHex)) {
    throw new Error('Invalid password salt.');
  }

  const derived = CryptoJS.PBKDF2(password, CryptoJS.enc.Hex.parse(saltHex), {
    keySize: PBKDF2_KEY_LENGTH_BYTES / 4,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });

  return derived.toString(CryptoJS.enc.Hex);
};

const timingSafeEqualHex = (leftHex, rightHex) => {
  if (!isValidHex(leftHex) || !isValidHex(rightHex)) {
    return false;
  }

  const left = leftHex.toLowerCase();
  const right = rightHex.toLowerCase();

  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let i = 0; i < maxLength; i++) {
    const leftByte = i < left.length ? left.charCodeAt(i) : 0;
    const rightByte = i < right.length ? right.charCodeAt(i) : 0;
    diff |= leftByte ^ rightByte;
  }

  return diff === 0;
};

export const hasAdminPassword = async (userId) => {
  if (!userId) return false;

  const { data, error } = await supabase
    .from('admin_credentials')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch admin credential:', error);
    return false;
  }

  return Boolean(data?.user_id);
};

export const setAdminPassword = async (userId, password) => {
  if (!userId || !password) return;

  const passwordSalt = generateSaltHex();
  const passwordHash = await hashPassword(password, passwordSalt);
  const { error } = await supabase
    .from('admin_credentials')
    .upsert({ user_id: userId, password_hash: passwordHash, password_salt: passwordSalt }, { onConflict: 'user_id' });

  if (error) {
    throw error;
  }
};

export const verifyAdminPassword = async (userId, password) => {
  if (!userId || !password) return false;

  const { data, error } = await supabase
    .from('admin_credentials')
    .select('password_hash, password_salt')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.password_hash) {
    if (error) {
      console.error('Failed to verify admin password:', error);
    }
    return false;
  }

  // Support for New PBKDF2 hashes (with salt)
  if (data.password_salt) {
    const incomingHash = await hashPassword(password, data.password_salt);
    const matches = timingSafeEqualHex(incomingHash, data.password_hash);
    
    // If password matches and doesn't have proper salt format, rehash it
    if (matches) {
      return true;
    }
    return false;
  }

  // Fallback: Support for OLD unsalted SHA-256 hashes (backwards compatibility)
  const computedHash = CryptoJS.SHA256(password).toString(CryptoJS.enc.Hex);
  
  return timingSafeEqualHex(computedHash, data.password_hash);
};

export const changeAdminPassword = async (userId, currentPassword, newPassword) => {
  if (!userId || !currentPassword || !newPassword) {
    throw new Error('User ID, current password, and new password are required');
  }

  if (currentPassword === newPassword) {
    throw new Error('New password must be different from current password');
  }

  // Verify current password
  const isValid = await verifyAdminPassword(userId, currentPassword);
  if (!isValid) {
    throw new Error('Current password is incorrect');
  }

  // Hash new password with fresh salt
  const newPasswordSalt = generateSaltHex();
  const newPasswordHash = await hashPassword(newPassword, newPasswordSalt);

  // Update admin credentials
  const { error } = await supabase
    .from('admin_credentials')
    .update({ password_hash: newPasswordHash, password_salt: newPasswordSalt, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) {
    throw new Error('Failed to update password. Please try again.');
  }

  return true;
};

export const forceResetAdminPassword = async (userId, newPassword) => {
  if (!userId || !newPassword) {
    throw new Error('User ID and new password are required');
  }

  // Hash new password with fresh salt
  const newPasswordSalt = generateSaltHex();
  const newPasswordHash = await hashPassword(newPassword, newPasswordSalt);

  // Force update without verifying old password
  const { error } = await supabase
    .from('admin_credentials')
    .update({ password_hash: newPasswordHash, password_salt: newPasswordSalt, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) {
    throw new Error('Failed to reset password. Please try again.');
  }

  return true;
};

export const canAccessPath = (mode, pathname) => {
  if (mode === ACCESS_MODE.ADMIN) return true;
  if (mode !== ACCESS_MODE.RECEPTION) return false;

  return RECEPTION_ALLOWED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
};
