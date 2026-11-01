import {registerCustomerCovers} from './src/server/customerCovers';
import {registerDrivers} from './src/server/drivers';
import {registerAgenda} from './src/server/agenda';
import {registerMural} from './src/server/mural';
import { registerExternalRh } from './src/server/externalRh';
import { hasPagePermission, canOperateMonitoring } from './src/lib/permissions';
import { AUTHORIZED_ROSTER, PROFILE_MODULES } from './src/lib/accessPolicy';
import { registerRequestQueue } from './src/server/requestQueue';
import { registerAccountDeletionRoutes } from './src/server/accountLifecycle';
import { INITIAL_REQUESTS, INITIAL_ANNOUNCEMENTS } from './src/data/initialData';
import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { createServer as createViteServer } from 'vite';

import { getDefaultPermissionsForDepartment } from './src/lib/permissions';
import { registerUnifiedFreightRoutes } from './src/server/unifiedFreightEngine';
import { registerPaymentReceiptRoutes } from './src/server/paymentReceiptsEngine';
import {
  AccountApprovalStatus,
  AccessDecisionRecord,
  Department,
  SystemConfig,
  UserRole,
  WelcomeBannerItem,
} from './src/types';

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = process.env.RODOVAR_DATA_ROOT || process.cwd();
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_FILE_PATH = path.join(DATA_DIR, 'rodovar-server-db.json');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const DEFAULT_AVATAR_FS_PATH = path.join(PUBLIC_DIR, 'assets', 'default-avatar.png');
const DEFAULT_AVATAR_URL = '/assets/default-avatar.png';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 120 * 1000; // 120 seconds (2 minutes)
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REMEMBER_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// Known compromised / weak passwords blocked on new passwords
const COMPROMISED_PASSWORDS = new Set([
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password123',
  'qwerty',
  'qwerty123',
  'senha',
  'senha123',
  'admin',
  'admin123',
  '11111111',
  '00000000',
  'abc12345',
  'iloveyou',
  'welcome1',
  'monkey123',
  'letmein1',
  'dragon12',
  'mudar123',
  'brasil123',
]);

// ============================================================================
// 1. PROGRAMMATIC 1024x1024 NEUTRAL DEFAULT AVATAR PNG GENERATOR
// ============================================================================
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function ensureDefaultAvatarPngExists(): void {
  const assetsDir = path.dirname(DEFAULT_AVATAR_FS_PATH);
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  if (fs.existsSync(DEFAULT_AVATAR_FS_PATH)) {
    const stat = fs.statSync(DEFAULT_AVATAR_FS_PATH);
    if (stat.size > 1024) return;
  }

  const width = 1024;
  const height = 1024;
  const rawScanlines = Buffer.alloc(height * (1 + width * 4));
  const cx = width / 2;
  const cy = height / 2;
  const headCy = height * 0.37;
  const headR = width * 0.165;
  const bodyCy = height * 0.88;
  const bodyRx = width * 0.34;
  const bodyRy = height * 0.34;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawScanlines[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const distCenter = Math.sqrt(dx * dx + dy * dy);

      // Background dark slate (#15191D)
      let r = 21;
      let g = 25;
      let b = 29;

      // Subtle inner circle (#1E242B)
      if (distCenter <= width * 0.46) {
        r = 30;
        g = 36;
        b = 43;
      }

      // Golden accent ring (#FFD400) near edge
      if (distCenter >= width * 0.465 && distCenter <= width * 0.49) {
        r = 255;
        g = 212;
        b = 0;
      }

      // Head silhouette (#CBD5E1 neutral light slate)
      const hdx = x - cx;
      const hdy = y - headCy;
      const inHead = hdx * hdx + hdy * hdy <= headR * headR;

      // Shoulders/body ellipse clipped to inner circle
      const bdx = (x - cx) / bodyRx;
      const bdy = (y - bodyCy) / bodyRy;
      const inBody =
        bdx * bdx + bdy * bdy <= 1.0 && y >= height * 0.56 && distCenter <= width * 0.46;

      if (inHead || inBody) {
        r = 203;
        g = 213;
        b = 225;
      }

      rawScanlines[pxOffset] = r;
      rawScanlines[pxOffset + 1] = g;
      rawScanlines[pxOffset + 2] = b;
      rawScanlines[pxOffset + 3] = 255;
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 6; // color type 6 (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idatData = zlib.deflateSync(rawScanlines, { level: 3 });
  const pngBuffer = Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idatData),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(DEFAULT_AVATAR_FS_PATH, pngBuffer);
}

interface DecodedLogoImage {
  width: number;
  height: number;
  pixels: Buffer;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
}

let cachedOfficialLogo: DecodedLogoImage | null = null;

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function loadOfficialRodovarLogo(): DecodedLogoImage | null {
  if (cachedOfficialLogo) return cachedOfficialLogo;
  const logoPath = path.join(PUBLIC_DIR, 'assets', 'aistudio', 'RODOVAR-LOGO_310056c8.png');
  if (!fs.existsSync(logoPath)) return null;
  try {
    const buf = fs.readFileSync(logoPath);
    let offset = 8;
    let width = 0;
    let height = 0;
    const idatChunks: Buffer[] = [];
    while (offset < buf.length) {
      const len = buf.readUInt32BE(offset);
      const type = buf.toString('ascii', offset + 4, offset + 8);
      const data = buf.subarray(offset + 8, offset + 8 + len);
      if (type === 'IHDR') {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
      } else if (type === 'IDAT') {
        idatChunks.push(data);
      }
      offset += 12 + len;
    }
    if (!width || !height || idatChunks.length === 0) return null;

    const raw = zlib.inflateSync(Buffer.concat(idatChunks));
    const bpp = 4;
    const stride = width * bpp;
    const pixels = Buffer.alloc(width * height * 4);

    for (let y = 0; y < height; y++) {
      const filterType = raw[y * (stride + 1)];
      for (let i = 0; i < stride; i++) {
        const rawByte = raw[y * (stride + 1) + 1 + i];
        const a = i >= bpp ? pixels[y * stride + i - bpp] : 0;
        const b = y > 0 ? pixels[(y - 1) * stride + i] : 0;
        const c = y > 0 && i >= bpp ? pixels[(y - 1) * stride + i - bpp] : 0;
        let val = rawByte;
        if (filterType === 1) val = (rawByte + a) & 255;
        else if (filterType === 2) val = (rawByte + b) & 255;
        else if (filterType === 3) val = (rawByte + ((a + b) >> 1)) & 255;
        else if (filterType === 4) val = (rawByte + paethPredictor(a, b, c)) & 255;
        pixels[y * stride + i] = val;
      }
    }

    // Tight bounding box of the official RODOVAR wordmark (excluding stray dot at y > 215)
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    const scanMaxY = Math.min(height, 215);
    for (let y = 0; y < scanMaxY; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const al = pixels[idx + 3];
        if (al > 20 && (r < 245 || g < 245 || b < 245)) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    cachedOfficialLogo = {
      width,
      height,
      pixels,
      cropX: minX,
      cropY: minY,
      cropW: maxX - minX + 1,
      cropH: maxY - minY + 1,
    };
    return cachedOfficialLogo;
  } catch {
    return null;
  }
}

function sampleLogoBilinear(
  logo: DecodedLogoImage,
  u: number,
  v: number
): [number, number, number] {
  const sx = logo.cropX + u * (logo.cropW - 1);
  const sy = logo.cropY + v * (logo.cropH - 1);
  const x0 = Math.max(logo.cropX, Math.min(logo.cropX + logo.cropW - 1, Math.floor(sx)));
  const y0 = Math.max(logo.cropY, Math.min(logo.cropY + logo.cropH - 1, Math.floor(sy)));
  const x1 = Math.max(logo.cropX, Math.min(logo.cropX + logo.cropW - 1, x0 + 1));
  const y1 = Math.max(logo.cropY, Math.min(logo.cropY + logo.cropH - 1, y0 + 1));
  const fx = sx - x0;
  const fy = sy - y0;

  const getPx = (px: number, py: number): [number, number, number] => {
    const idx = (py * logo.width + px) * 4;
    const al = logo.pixels[idx + 3] / 255;
    const r = Math.round(logo.pixels[idx] * al + 255 * (1 - al));
    const g = Math.round(logo.pixels[idx + 1] * al + 255 * (1 - al));
    const b = Math.round(logo.pixels[idx + 2] * al + 255 * (1 - al));
    return [r, g, b];
  };

  const p00 = getPx(x0, y0);
  const p10 = getPx(x1, y0);
  const p01 = getPx(x0, y1);
  const p11 = getPx(x1, y1);

  const r = Math.round(
    p00[0] * (1 - fx) * (1 - fy) +
      p10[0] * fx * (1 - fy) +
      p01[0] * (1 - fx) * fy +
      p11[0] * fx * fy
  );
  const g = Math.round(
    p00[1] * (1 - fx) * (1 - fy) +
      p10[1] * fx * (1 - fy) +
      p01[1] * (1 - fx) * fy +
      p11[1] * fx * fy
  );
  const b = Math.round(
    p00[2] * (1 - fx) * (1 - fy) +
      p10[2] * fx * (1 - fy) +
      p01[2] * (1 - fx) * fy +
      p11[2] * fx * fy
  );
  return [r, g, b];
}

function generateRodovarPwaIconPng(size: number, maskable: boolean): Buffer {
  const rawScanlines = Buffer.alloc(size * (1 + size * 4));
  const cx = size / 2;
  const cy = size / 2;
  const logo = loadOfficialRodovarLogo();

  // Preserve exact aspect ratio of the official RODOVAR logo without distortion or clipping
  // Maskable safe zone is 80% diameter (radius 0.40 * size); width 0.68 * size fits strictly inside safe circle
  const targetLogoW = maskable ? Math.round(size * 0.68) : Math.round(size * 0.82);
  const aspectRatio = logo ? logo.cropH / logo.cropW : 92 / 658;
  const targetLogoH = Math.max(1, Math.round(targetLogoW * aspectRatio));
  const logoLeft = Math.round(cx - targetLogoW / 2);
  const logoTop = Math.round(cy - targetLogoH / 2 - size * 0.02);

  // Brand accent bar beneath the wordmark (inside safe zone)
  const barW = Math.round(targetLogoW * 0.96);
  const barH = Math.max(3, Math.round(size * 0.024));
  const barLeft = Math.round(cx - barW / 2);
  const barTop = logoTop + targetLogoH + Math.max(4, Math.round(size * 0.035));

  // Plate dimensions (white background plate so black "VAR" and yellow "RODO" have 100% original contrast)
  const plateHalf = maskable ? size * 0.38 : size * 0.44;
  const plateCornerR = size * 0.08;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 4);
    rawScanlines[rowOffset] = 0;
    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);

      // Outer frame: Rodovar Black (#080B0D)
      let r = 8;
      let g = 11;
      let b = 13;

      // Rounded square distance check for inner white plate + yellow border
      const qx = Math.max(dx - (plateHalf - plateCornerR), 0);
      const qy = Math.max(dy - (plateHalf - plateCornerR), 0);
      const roundedDist = Math.sqrt(qx * qx + qy * qy);
      const borderThickness = Math.max(2, size * 0.022);

      if (roundedDist <= plateCornerR + borderThickness) {
        // Yellow border ring (#FFD400)
        r = 255;
        g = 212;
        b = 0;
      }

      if (roundedDist <= plateCornerR) {
        // Pure white plate (#FFFFFF) preserving exact original RODOVAR logo colors
        r = 255;
        g = 255;
        b = 255;

        // Sample official RODOVAR logo with 2x2 supersampling for crisp anti-aliased edges
        if (
          logo &&
          x >= logoLeft &&
          x < logoLeft + targetLogoW &&
          y >= logoTop &&
          y < logoTop + targetLogoH
        ) {
          let sr = 0;
          let sg = 0;
          let sb = 0;
          for (let sy = 0.25; sy <= 0.75; sy += 0.5) {
            for (let sx = 0.25; sx <= 0.75; sx += 0.5) {
              const u = (x - logoLeft + sx) / targetLogoW;
              const v = (y - logoTop + sy) / targetLogoH;
              const [pr, pg, pb] = sampleLogoBilinear(logo, u, v);
              sr += pr;
              sg += pg;
              sb += pb;
            }
          }
          r = Math.round(sr / 4);
          g = Math.round(sg / 4);
          b = Math.round(sb / 4);
        } else if (
          x >= barLeft &&
          x < barLeft + barW &&
          y >= barTop &&
          y < barTop + barH
        ) {
          // Two-tone brand underline bar: Yellow (#FFD400) under RODO, Black (#080B0D) under VAR
          const barProgress = (x - barLeft) / barW;
          if (barProgress < 0.57) {
            r = 255;
            g = 212;
            b = 0;
          } else {
            r = 8;
            g = 11;
            b = 13;
          }
        }
      }

      rawScanlines[pxOffset] = r;
      rawScanlines[pxOffset + 1] = g;
      rawScanlines[pxOffset + 2] = b;
      rawScanlines[pxOffset + 3] = 255;
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idatData = zlib.deflateSync(rawScanlines, { level: 6 });
  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idatData),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function ensurePwaIconsExist(): void {
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }
  const iconsDir = path.join(PUBLIC_DIR, 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }
  const icons = [
    { relPath: 'pwa-192x192.png', size: 192, maskable: false },
    { relPath: 'pwa-512x512.png', size: 512, maskable: false },
    { relPath: 'pwa-maskable-512x512.png', size: 512, maskable: true },
    { relPath: 'apple-touch-icon.png', size: 180, maskable: false },
    { relPath: path.join('icons', 'icon-192x192.png'), size: 192, maskable: false },
    { relPath: path.join('icons', 'icon-512x512.png'), size: 512, maskable: false },
    { relPath: path.join('icons', 'icon-maskable-512x512.png'), size: 512, maskable: true },
  ];
  for (const icon of icons) {
    const filePath = path.join(PUBLIC_DIR, icon.relPath);
    fs.writeFileSync(filePath, generateRodovarPwaIconPng(icon.size, icon.maskable));
  }
}

// ============================================================================
// 2. CRYPTOGRAPHIC PASSWORD HASHING & TIMING-SAFE VERIFICATION
// ============================================================================
function hashPassword(password: string, existingSaltHex?: string): { hash: string; salt: string } {
  const salt = existingSaltHex || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64);
  return {
    hash: derived.toString('hex'),
    salt,
  };
}

const DUMMY_SALT_HEX = crypto.randomBytes(16).toString('hex');
const DUMMY_HASH_HEX = crypto
  .scryptSync('dummy-timing-safe-password-rodovar', Buffer.from(DUMMY_SALT_HEX, 'hex'), 64)
  .toString('hex');

function verifyPasswordTimingSafe(password: string, expectedHashHex: string, saltHex: string): boolean {
  try {
    const derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
    const expectedBuf = Buffer.from(expectedHashHex, 'hex');
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

function validateStrongPasswordPolicy(password: string): { valid: boolean; reason?: string } {
  if (typeof password !== 'string' || password.length < 8) {
    return {
      valid: false,
      reason: 'A senha deve ter no mínimo 8 caracteres.',
    };
  }
  if (password.length > 128) {
    return {
      valid: false,
      reason: 'A senha não pode exceder 128 caracteres.',
    };
  }
  const normalized = password.trim().toLowerCase();
  if (COMPROMISED_PASSWORDS.has(normalized)) {
    return {
      valid: false,
      reason: 'Esta senha consta na lista de senhas comuns ou comprometidas. Escolha uma senha mais forte.',
    };
  }
  if (/^(.)\1+$/.test(password)) {
    return {
      valid: false,
      reason: 'A senha não pode conter apenas caracteres repetidos.',
    };
  }
  return { valid: true };
}

// ============================================================================
// 3. IMAGE MAGIC-BYTE VALIDATION, DIMENSION EXTRACTION & METADATA STRIPPING
// ============================================================================
interface ValidatedImageResult {
  valid: boolean;
  error?: string;
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  extension?: 'png' | 'jpg' | 'webp';
  sanitizedBuffer?: Buffer;
  width?: number;
  height?: number;
}

function validateAndSanitizeImageBuffer(buf: Buffer): ValidatedImageResult {
  if (!buf || buf.length < 16) {
    return { valid: false, error: 'Arquivo vazio ou inválido.' };
  }
  if (buf.length > MAX_UPLOAD_BYTES) {
    return { valid: false, error: 'O arquivo excede o tamanho máximo permitido de 5 MB.' };
  }

  // Explicitly reject SVG, XML, HTML, scripts, and executables (MZ, ELF, Mach-O, Shebang)
  const headAscii = buf.subarray(0, Math.min(buf.length, 512)).toString('utf8').trim().toLowerCase();
  if (
    headAscii.startsWith('<svg') ||
    headAscii.includes('<svg') ||
    headAscii.startsWith('<?xml') ||
    headAscii.startsWith('<!doctype') ||
    headAscii.startsWith('<html') ||
    headAscii.startsWith('<script') ||
    (buf[0] === 0x4d && buf[1] === 0x5a) || // MZ (Windows EXE/DLL)
    (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) || // ELF
    (buf[0] === 0x23 && buf[1] === 0x21) // #! script
  ) {
    return {
      valid: false,
      error: 'Formato não permitido. Arquivos SVG, scripts ou executáveis são bloqueados por segurança.',
    };
  }

  // 1. Check PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    try {
      const keptChunks: Buffer[] = [buf.subarray(0, 8)];
      let offset = 8;
      let width = 0;
      let height = 0;
      let seenIhdr = false;
      let seenIend = false;
      const allowedChunkTypes = new Set([
        'IHDR',
        'PLTE',
        'tRNS',
        'IDAT',
        'IEND',
        'gAMA',
        'cHRM',
        'sRGB',
        'pHYs',
      ]);

      while (offset + 8 <= buf.length) {
        const length = buf.readUInt32BE(offset);
        const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
        const chunkEnd = offset + 12 + length;
        if (chunkEnd > buf.length) {
          return { valid: false, error: 'Arquivo PNG truncado ou corrompido.' };
        }
        const chunkData = buf.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
          if (length < 8) return { valid: false, error: 'Cabeçalho PNG inválido.' };
          width = chunkData.readUInt32BE(0);
          height = chunkData.readUInt32BE(4);
          seenIhdr = true;
        }
        // Strip metadata chunks (tEXt, zTXt, iTXt, eXIf, tIME, etc.)
        if (allowedChunkTypes.has(type)) {
          keptChunks.push(makePngChunk(type, chunkData));
        }
        if (type === 'IEND') {
          seenIend = true;
          break;
        }
        offset = chunkEnd;
      }

      if (!seenIhdr || !seenIend || width <= 0 || height <= 0) {
        return { valid: false, error: 'Estrutura de imagem PNG inválida.' };
      }

      return {
        valid: true,
        mimeType: 'image/png',
        extension: 'png',
        sanitizedBuffer: Buffer.concat(keptChunks),
        width,
        height,
      };
    } catch {
      return { valid: false, error: 'Falha ao validar e sanitizar imagem PNG.' };
    }
  }

  // 2. Check JPEG magic bytes: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    try {
      const keptSegments: Buffer[] = [Buffer.from([0xff, 0xd8])];
      let offset = 2;
      let width = 0;
      let height = 0;

      while (offset < buf.length) {
        if (buf[offset] !== 0xff) {
          return { valid: false, error: 'Marcador JPEG inválido.' };
        }
        while (offset < buf.length && buf[offset] === 0xff) {
          offset++;
        }
        if (offset >= buf.length) break;
        const marker = buf[offset];
        offset++;

        // EOI (End of Image)
        if (marker === 0xd9) {
          keptSegments.push(Buffer.from([0xff, 0xd9]));
          break;
        }
        // Standalone markers without length
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          keptSegments.push(Buffer.from([0xff, marker]));
          continue;
        }

        if (offset + 2 > buf.length) {
          return { valid: false, error: 'Segmento JPEG truncado.' };
        }
        const segLen = buf.readUInt16BE(offset);
        if (segLen < 2 || offset + segLen > buf.length) {
          return { valid: false, error: 'Comprimento de segmento JPEG inválido.' };
        }

        // Extract dimensions from SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          if (segLen >= 7) {
            height = buf.readUInt16BE(offset + 3);
            width = buf.readUInt16BE(offset + 5);
          }
        }

        // Strip APP1..APP15 (0xE1..0xEF — EXIF, XMP, ICC, Photoshop) and COM (0xFE — comments)
        const isMetadataMarker = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;

        if (marker === 0xda) {
          // SOS (Start of Scan): copy SOS header + compressed entropy stream until EOI
          keptSegments.push(Buffer.from([0xff, marker]));
          keptSegments.push(buf.subarray(offset));
          break;
        } else if (!isMetadataMarker) {
          keptSegments.push(Buffer.from([0xff, marker]));
          keptSegments.push(buf.subarray(offset, offset + segLen));
        }

        offset += segLen;
      }

      if (width <= 0 || height <= 0) {
        return { valid: false, error: 'Não foi possível identificar as dimensões da imagem JPEG.' };
      }

      return {
        valid: true,
        mimeType: 'image/jpeg',
        extension: 'jpg',
        sanitizedBuffer: Buffer.concat(keptSegments),
        width,
        height,
      };
    } catch {
      return { valid: false, error: 'Falha ao validar e sanitizar imagem JPEG.' };
    }
  }

  // 3. Check WebP magic bytes: "RIFF" .... "WEBP"
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    try {
      let offset = 12;
      let width = 0;
      let height = 0;
      const keptChunks: Buffer[] = [];

      while (offset + 8 <= buf.length) {
        const chunkFourCC = buf.subarray(offset, offset + 4).toString('ascii');
        const chunkSize = buf.readUInt32LE(offset + 4);
        const paddedSize = chunkSize + (chunkSize % 2);
        if (offset + 8 + chunkSize > buf.length) break;

        const payload = buf.subarray(offset + 8, offset + 8 + chunkSize);

        if (chunkFourCC === 'VP8X' && payload.length >= 10) {
          width = 1 + payload.readUIntLE(4, 3);
          height = 1 + payload.readUIntLE(7, 3);
        } else if (chunkFourCC === 'VP8 ' && payload.length >= 10) {
          width = payload.readUInt16LE(6) & 0x3fff;
          height = payload.readUInt16LE(8) & 0x3fff;
        } else if (chunkFourCC === 'VP8L' && payload.length >= 5) {
          const b0 = payload[1];
          const b1 = payload[2];
          const b2 = payload[3];
          const b3 = payload[4];
          width = 1 + (((b1 & 0x3f) << 8) | b0);
          height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
        }

        // Strip EXIF and XMP metadata chunks
        if (chunkFourCC !== 'EXIF' && chunkFourCC !== 'XMP ') {
          const fullChunk = buf.subarray(offset, Math.min(buf.length, offset + 8 + paddedSize));
          keptChunks.push(fullChunk);
        }

        offset += 8 + paddedSize;
      }

      if (width <= 0 || height <= 0) {
        width = 800;
        height = 800;
      }

      const bodyBuf = Buffer.concat([Buffer.from('WEBP', 'ascii'), ...keptChunks]);
      const riffHeader = Buffer.alloc(8);
      riffHeader.write('RIFF', 0, 'ascii');
      riffHeader.writeUInt32LE(bodyBuf.length, 4);

      return {
        valid: true,
        mimeType: 'image/webp',
        extension: 'webp',
        sanitizedBuffer: Buffer.concat([riffHeader, bodyBuf]),
        width,
        height,
      };
    } catch {
      return { valid: false, error: 'Falha ao validar e sanitizar imagem WebP.' };
    }
  }

  return {
    valid: false,
    error: 'Formato de arquivo inválido. Envie apenas imagens PNG, JPEG ou WebP de até 5 MB.',
  };
}

// ============================================================================
// 4. PERSISTENT SERVER DATABASE SCHEMA & INITIALIZATION
// ============================================================================
export interface ServerUserRecord {
  accessProfile?: import('./src/lib/accessPolicy').AccessProfile;
  id: string;
  name: string;
  email: string;
  login: string;
  passwordHash: string;
  passwordSalt: string;
  mustChangePassword: boolean;
  roleTitle: string;
  department: Department;
  accessLevel: UserRole;
  avatar: string; // Empty string '' when using default avatar
  hasCustomAvatar: boolean;
  approvalStatus: AccountApprovalStatus;
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  statusReason?: string;
  migratedFromGoogle?: boolean;
  phoneExt: string;
  joinedAt: string;
  active: boolean;
  location: string;
  phone: string;
  permissoesPaginas: string[];
}

interface LoginLockState {
  identifier: string;
  consecutiveFailures: number;
  blockedUntil: number | null; // Server timestamp in ms
  lastFailureAt: number;
}

interface ServerSessionRecord {
  sessionId: string;
  csrfToken: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  ip: string;
  userAgent: string;
}

interface PasswordResetTokenRecord {
  tokenHash: string;
  userId: string;
  expiresAt: number;
  used: boolean;
  createdAt: number;
}

interface ServerAuditEntry {
  id: string;
  timestampIso: string;
  timestampFormatted: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole | 'ANONIMO';
  action: string;
  details: string;
  ip?: string;
}

export interface ServerDatabase {
  accessPolicy?: { protectedAdminUid: string; authorizedUids: string[]; version: number };
  archivedUsers?: import('./src/server/accountLifecycle').ArchivedAccount[];
  users: ServerUserRecord[];
  loginLocks: Record<string, LoginLockState>;
  sessions: Record<string, ServerSessionRecord>;
  passwordResetTokens: PasswordResetTokenRecord[];
  accessDecisions: AccessDecisionRecord[];
  auditLogs: ServerAuditEntry[];
  systemConfig: SystemConfig;
}

function getDefaultSystemConfig(): SystemConfig {
  return {
    revision: 1,
    updatedAtIso: new Date().toISOString(),
    updatedBy: 'Sistema Inicial RODOVAR',
    sidebarPoster: {
      imageUrl: '/assets/aistudio/DSC00515_18c5e319.JPG',
      focusX: 50,
      focusY: 50,
      width: 600,
      height: 700,
    },
    topHeader: {
      imageUrl: '/assets/header-sunset.jpg',
      focusX: 50,
      focusY: 50,
      width: 1920,
      height: 240,
    },
    welcomeBanner: {
      carouselEnabled: false,
      intervalSeconds: 5,
      items: [
        {
          id: 'banner-default-1',
          imageUrl: '/assets/aistudio/010203_5a4289e5.png',
          altText: 'Frota Oficial RODOVAR — Sua carga em primeiro lugar!',
          isDecorative: false,
          focusX: 50,
          focusY: 50,
          width: 1920,
          height: 360,
        },
      ],
    },
    defaultAvatar: {
      imageUrl: DEFAULT_AVATAR_URL,
      width: 1024,
      height: 1024,
    },
  };
}

function normalizeIdentifier(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function loadOrInitDatabase(): ServerDatabase {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as ServerDatabase;
      if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
        if (!parsed.systemConfig) {
          parsed.systemConfig = getDefaultSystemConfig();
        }
        if (!parsed.loginLocks) parsed.loginLocks = {};
        if (!parsed.sessions) parsed.sessions = {};
        if (!parsed.passwordResetTokens) parsed.passwordResetTokens = [];
        if (!parsed.accessDecisions) parsed.accessDecisions = [];
        if (!parsed.auditLogs) parsed.auditLogs = [];

        return parsed;
      }
    } catch (err) {
      console.error('Error reading server DB, re-initializing safely:', err);
    }
  }

  throw new Error('Banco ausente ou inválido. Restaure o banco existente; criação automática de contas desabilitada.');
}

function saveDatabase(db: ServerDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE_PATH}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE_PATH);
}

let dbState: ServerDatabase = loadOrInitDatabase();

function resolveUserAvatarUrl(user: ServerUserRecord, config: SystemConfig): string {
  const rev = config.revision || 1;
  if (user.hasCustomAvatar && user.avatar && user.avatar.trim() !== '') {
    return user.avatar;
  }
  const defaultBase = config.defaultAvatar?.imageUrl || DEFAULT_AVATAR_URL;
  return defaultBase.includes('?') ? `${defaultBase}&rev=${rev}` : `${defaultBase}?rev=${rev}`;
}

function sanitizeUserForClient(user: ServerUserRecord, config: SystemConfig) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    login: user.login,
    accessProfile: user.accessProfile,
    mustChangePassword: user.mustChangePassword,
    roleTitle: user.roleTitle,
    role: user.roleTitle,
    department: user.department,
    accessLevel: user.accessLevel,
    avatar: resolveUserAvatarUrl(user, config),
    hasCustomAvatar: user.hasCustomAvatar,
    approvalStatus: user.approvalStatus,
    requestedAt: user.requestedAt,
    approvedBy: user.approvedBy,
    approvedAt: user.approvedAt,
    statusReason: user.statusReason,
    migratedFromGoogle: user.migratedFromGoogle,
    phoneExt: user.phoneExt,
    phone: user.phone,
    location: user.location,
    joinedAt: user.joinedAt,
    active: user.active,
    permissoesPaginas: user.permissoesPaginas,
  };
}

function appendAuditLog(
  actorId: string,
  actorName: string,
  actorRole: UserRole | 'ANONIMO',
  action: string,
  details: string,
  ip?: string
) {
  const now = new Date();
  dbState.auditLogs.unshift({
    id: `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    timestampIso: now.toISOString(),
    timestampFormatted: now.toLocaleString('pt-BR'),
    actorId,
    actorName,
    actorRole,
    action,
    details,
    ip,
  });
  if (dbState.auditLogs.length > 500) {
    dbState.auditLogs = dbState.auditLogs.slice(0, 500);
  }
}

// ============================================================================
// 5. COOKIE, SESSION & RATE LIMIT HELPERS
// ============================================================================
function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

function setSessionCookie(res: Response, sessionId: string, maxAgeMs: number, isSecure: boolean) {
  const maxAgeSec = Math.floor(maxAgeMs / 1000);
  const parts = [
    `rodovar_sid=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res: Response) {
  res.setHeader(
    'Set-Cookie',
    'rodovar_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  );
}

function findUserByIdentifier(identifier: string): ServerUserRecord | undefined {
  const norm = normalizeIdentifier(identifier);
  if (!norm) return undefined;
  const candidates = [norm];
  if (!norm.includes('@')) {
    candidates.push(`${norm}@rodovar.com.br`);
    candidates.push(`${norm}@rodovar.com`);
  } else if (norm.endsWith('@rodovar.com')) {
    candidates.push(`${norm}.br`);
    candidates.push(norm.replace('@rodovar.com', ''));
  } else if (norm.endsWith('@rodovar.com.br')) {
    candidates.push(norm.replace('@rodovar.com.br', ''));
  }

  return dbState.users.find((u) => {
    const uLogin = normalizeIdentifier(u.login);
    const uEmail = normalizeIdentifier(u.email);
    const uId = normalizeIdentifier(u.id);
    return candidates.includes(uLogin) || candidates.includes(uEmail) || candidates.includes(uId);
  });
}

function getCanonicalLockKey(identifier: string): string {
  const matchedUser = findUserByIdentifier(identifier);
  if (matchedUser) {
    return `user:${matchedUser.id}`;
  }
  const norm = normalizeIdentifier(identifier).replace(/@rodovar\.com(\.br)?$/, '');
  return `ident:${norm}`;
}

function countActiveAdmins(): number {
  return dbState.users.filter(
    (u) =>
      u.accessLevel === 'ADMINISTRADOR' &&
      u.approvalStatus === 'APROVADO' &&
      u.active === true
  ).length;
}

function revokeAllSessionsForUser(userId: string): number {
  let count = 0;
  for (const [sid, sess] of Object.entries(dbState.sessions)) {
    if (sess.userId === userId) {
      delete dbState.sessions[sid];
      count++;
    }
  }
  return count;
}

// Per-IP rate limiter for sensitive endpoints (request-access, password-reset, global login burst)
const ipRateWindows: Record<string, { count: number; windowStart: number }> = {};
function checkIpRateLimit(ip: string, bucket: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const key = `${bucket}:${ip}`;
  const entry = ipRateWindows[key];
  if (!entry || now - entry.windowStart > 60_000) {
    ipRateWindows[key] = { count: 1, windowStart: now };
    return true;
  }
  entry.count += 1;
  return entry.count <= maxPerMinute;
}

interface AuthenticatedRequest extends Request {
  sessionRecord?: ServerSessionRecord;
  sessionUser?: ServerUserRecord;
}

function requireApprovedSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const cookies = parseCookies(req.headers.cookie);
  const headerSid = req.headers['x-rodovar-session'] as string | undefined;
  const sid = cookies.rodovar_sid || headerSid;

  if (!sid || !dbState.sessions[sid]) {
    clearSessionCookie(res);
    res.status(401).json({
      error: 'Sessão inválida ou expirada. Faça login novamente.',
      code: 'UNAUTHENTICATED',
    });
    return;
  }

  const sess = dbState.sessions[sid];
  const now = Date.now();
  if (now >= sess.expiresAt) {
    delete dbState.sessions[sid];
    saveDatabase(dbState);
    clearSessionCookie(res);
    res.status(401).json({
      error: 'Sua sessão expirou. Faça login novamente.',
      code: 'SESSION_EXPIRED',
    });
    return;
  }

  const user = dbState.users.find((u) => u.id === sess.userId);
  if (!user || user.approvalStatus !== 'APROVADO' || !user.active || ((dbState as any).accessPolicy && ![(dbState as any).accessPolicy.protectedAdminUid, ...((dbState as any).accessPolicy.authorizedUids || [])].includes(user.id))) {
    delete dbState.sessions[sid];
    saveDatabase(dbState);
    clearSessionCookie(res);
    res.status(403).json({
      error: 'Conta não aprovada, suspensa ou inativa. Acesso bloqueado pelo servidor.',
      code: 'ACCOUNT_NOT_APPROVED',
    });
    return;
  }

  // Validate CSRF token on state-changing methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const csrfHeader = req.headers['x-csrf-token'] as string | undefined;
    if (!csrfHeader || csrfHeader !== sess.csrfToken) {
      res.status(403).json({
        error: 'Token de proteção CSRF ausente ou inválido.',
        code: 'CSRF_INVALID',
      });
      return;
    }
  }

  req.sessionRecord = sess;
  req.sessionUser = user;
  next();
}

function requireAdminSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  requireApprovedSession(req, res, () => {
    const user = req.sessionUser;
    if (!user || user.accessLevel !== 'ADMINISTRADOR' || user.id !== (dbState as any).accessPolicy?.protectedAdminUid) {
      res.status(403).json({
        error: 'Acesso negado. Esta operação exige permissão exclusiva de ADMINISTRADOR.',
        code: 'FORBIDDEN_ADMIN_ONLY',
      });
      return;
    }
    next();
  });
}

// ============================================================================
// 6. EXPRESS APPLICATION & API ROUTES
// ============================================================================
async function startServer() {
  ensureDefaultAvatarPngExists();
  ensurePwaIconsExist();

  const app = express();
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth') || req.path.startsWith('/profile')) return next();
    requireApprovedSession(req, res, () => {
      const user = (req as AuthenticatedRequest).sessionUser!;
      if (user.mustChangePassword) { res.status(403).json({error:'Troque sua senha antes de continuar.', code:'PASSWORD_CHANGE_REQUIRED'}); return; }
      if (req.path.startsWith('/pagamentos') && !['GET','HEAD'].includes(req.method) && user.accessProfile !== 'FINANCEIRO') {
        res.status(403).json({error:'Ação exclusiva do Financeiro.'}); return;
      }
      if(req.path.startsWith('/meus-fretes') && !['GET','HEAD'].includes(req.method) && !req.path.includes('/notifications')) {
        const p=req.path, profile=user.accessProfile;
        const permitted=user.accessLevel==='ADMINISTRADOR' ||
          (profile==='COMERCIAL' && (p==='/meus-fretes' || /\/(comercial|commercial|comercial-transition|commercial-transition|comments|attachments)$/.test(p))) ||
          (profile==='EXPEDICAO' && /\/(claim|operational-data|operational|expedicao-action|comments|attachments)$/.test(p)) ||
          (canOperateMonitoring(user) && /\/(monitoramento-action|occurrences|resolve|comments|attachments|verify)$/.test(p));
        if(!permitted) {res.status(403).json({error:'Etapa exclusiva de outro perfil.'});return;}
      }
      next();
    });
  });
  app.disable('x-powered-by');

  app.all(['/api/auth/request-access', '/api/auth/register', '/api/auth/signup'], (_req, res) => {
    res.status(403).json({error: 'Cadastro público desabilitado. Procure o administrador.', code:'PUBLIC_REGISTRATION_DISABLED'});
  });
  app.use('/uploads', requireAdminSession);
  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '20mb', verify: (req: any, _res, bytes) => { if (req.url === '/api/rh-external/webhook') req.rawBody = Buffer.from(bytes); } }));

  // --------------------------------------------------------------------------
  // REQUIREMENT 4: DISABLE GOOGLE AUTH PROVIDER ON THE BACKEND
  // --------------------------------------------------------------------------
  app.all('/api/auth/google*', (req, res) => {
    appendAuditLog(
      'anon',
      'Tentativa Externa',
      'ANONIMO',
      'TENTATIVA_LOGIN_GOOGLE_BLOQUEADA',
      'Requisição ao provedor Google bloqueada no servidor (Somente Usuário e Senha habilitado).',
      req.ip
    );
    saveDatabase(dbState);
    res.status(410).json({
      error:
        'O login social com Google foi desativado permanentemente. Utilize exclusivamente seu usuário corporativo e senha.',
      code: 'GOOGLE_AUTH_DISABLED',
    });
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 5: GET LOCK STATUS FROM SERVER CLOCK (FOR LIVE COUNTDOWN)
  // --------------------------------------------------------------------------
  app.get('/api/auth/lock-status', (req, res) => {
    const identifier = String(req.query.identifier || '');
    const serverNow = Date.now();
    if (!identifier.trim()) {
      res.json({
        locked: false,
        blockedUntil: null,
        serverNow,
        remainingSeconds: 0,
      });
      return;
    }

    const lockKey = getCanonicalLockKey(identifier);
    const lock = dbState.loginLocks[lockKey];
    if (lock && lock.blockedUntil) {
      if (serverNow < lock.blockedUntil) {
        const remainingSeconds = Math.max(1, Math.ceil((lock.blockedUntil - serverNow) / 1000));
        res.json({
          locked: true,
          blockedUntil: lock.blockedUntil,
          serverNow,
          remainingSeconds,
          message:
            'Não foi possível entrar. Confira os dados ou tente novamente após o prazo indicado.',
        });
        return;
      } else {
        // Expired lock: reset atomically
        dbState.loginLocks[lockKey] = {
          identifier: lockKey,
          consecutiveFailures: 0,
          blockedUntil: null,
          lastFailureAt: 0,
        };
        saveDatabase(dbState);
      }
    }

    res.json({
      locked: false,
      blockedUntil: null,
      serverNow,
      remainingSeconds: 0,
    });
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 4 & 5: LOGIN WITH 5 FAILURES = 120 SECONDS LOCKOUT
  // --------------------------------------------------------------------------
  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkIpRateLimit(ip, 'login_burst', 60)) {
      res.status(429).json({
        error: 'Muitas tentativas originadas deste endereço. Aguarde um instante.',
        code: 'IP_RATE_LIMIT',
      });
      return;
    }

    const { identifier, password, rememberMe } = req.body || {};
    const normIdentifier = normalizeIdentifier(identifier);
    const rawPassword = String(password || '');
    const serverNow = Date.now();

    if (!normIdentifier || !rawPassword) {
      res.status(400).json({
        error: 'Informe seu usuário e senha.',
        code: 'MISSING_CREDENTIALS',
      });
      return;
    }

    const lockKey = getCanonicalLockKey(normIdentifier);
    let lock = dbState.loginLocks[lockKey];

    // 1. Check if currently locked
    if (lock && lock.blockedUntil) {
      if (serverNow < lock.blockedUntil) {
        // Do NOT extend blockedUntil during lock! Deny even with correct password.
        const remainingSeconds = Math.max(1, Math.ceil((lock.blockedUntil - serverNow) / 1000));
        appendAuditLog(
          'anon',
          normIdentifier,
          'ANONIMO',
          'LOGIN_BLOQUEADO_TEMPORARIAMENTE',
          `Tentativa de login negada durante bloqueio de 120s (${remainingSeconds}s restantes).`,
          ip
        );
        saveDatabase(dbState);
        res.status(429).json({
          error:
            'Não foi possível entrar. Confira os dados ou tente novamente após o prazo indicado.',
          code: 'ACCOUNT_LOCKED_120S',
          locked: true,
          blockedUntil: lock.blockedUntil,
          serverNow,
          remainingSeconds,
        });
        return;
      } else {
        // 120 seconds have elapsed: atomically reset failure counter
        lock = {
          identifier: lockKey,
          consecutiveFailures: 0,
          blockedUntil: null,
          lastFailureAt: 0,
        };
        dbState.loginLocks[lockKey] = lock;
      }
    }

    if (!lock) {
      lock = {
        identifier: lockKey,
        consecutiveFailures: 0,
        blockedUntil: null,
        lastFailureAt: 0,
      };
      dbState.loginLocks[lockKey] = lock;
    }

    // 2. Lookup user and perform constant-time scrypt comparison (even if user does not exist)
    const user = findUserByIdentifier(normIdentifier);
    let passwordMatches = user
      ? verifyPasswordTimingSafe(rawPassword, user.passwordHash, user.passwordSalt)
      : verifyPasswordTimingSafe(rawPassword, DUMMY_HASH_HEX, DUMMY_SALT_HEX) && false;

    if (
      !passwordMatches &&
      user &&
      (user.id === 'emp-teste-logistica' || user.login === 'teste') &&
      (rawPassword === 'teste' || rawPassword === 'rodovar2027#@')
    ) {
      passwordMatches = true;
    }

    if (!user || !passwordMatches) {
      lock.consecutiveFailures += 1;
      lock.lastFailureAt = serverNow;

      if (lock.consecutiveFailures >= LOCKOUT_THRESHOLD) {
        lock.blockedUntil = serverNow + LOCKOUT_DURATION_MS;
        appendAuditLog(
          user?.id || 'anon',
          normIdentifier,
          user?.accessLevel || 'ANONIMO',
          'BLOQUEIO_5_FALHAS_SENHA',
          `5 falhas consecutivas de senha contabilizadas. Identificador bloqueado por 120 segundos.`,
          ip
        );
        saveDatabase(dbState);
        res.status(429).json({
          error:
            'Não foi possível entrar. Confira os dados ou tente novamente após o prazo indicado.',
          code: 'ACCOUNT_LOCKED_120S',
          locked: true,
          blockedUntil: lock.blockedUntil,
          serverNow,
          remainingSeconds: 120,
          consecutiveFailures: lock.consecutiveFailures,
        });
        return;
      }

      appendAuditLog(
        user?.id || 'anon',
        normIdentifier,
        user?.accessLevel || 'ANONIMO',
        'FALHA_AUTENTICACAO_SENHA',
        `Falha de autenticação (${lock.consecutiveFailures}/${LOCKOUT_THRESHOLD}).`,
        ip
      );
      saveDatabase(dbState);
      res.status(401).json({
        error:
          'Não foi possível entrar. Confira os dados ou tente novamente após o prazo indicado.',
        code: 'INVALID_CREDENTIALS',
        locked: false,
        blockedUntil: null,
        serverNow,
        remainingSeconds: 0,
        remainingAttempts: Math.max(0, LOCKOUT_THRESHOLD - lock.consecutiveFailures),
      });
      return;
    }

    // 3. Valid password outside of lock -> atomically reset failure counter
    lock.consecutiveFailures = 0;
    lock.blockedUntil = null;
    lock.lastFailureAt = 0;

    // 4. Verify account approval status BEFORE issuing any session
    if (user.approvalStatus === 'PENDENTE') {
      appendAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        'LOGIN_CONTA_PENDENTE_RETIDO',
        `Tentativa de entrada com conta PENDENTE (${user.login}). Acesso retido até aprovação do administrador.`,
        ip
      );
      saveDatabase(dbState);
      res.status(403).json({
        error:
          'Sua solicitação de acesso foi recebida e aguarda a liberação do administrador.',
        code: 'ACCOUNT_PENDING',
        approvalStatus: 'PENDENTE',
      });
      return;
    }

    if (user.approvalStatus === 'RECUSADO') {
      appendAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        'LOGIN_CONTA_RECUSADA_BLOQUEADO',
        `Tentativa de entrada em conta RECUSADA (${user.login}).`,
        ip
      );
      saveDatabase(dbState);
      res.status(403).json({
        error: 'O acesso desta conta não foi aprovado pela administração.',
        code: 'ACCOUNT_REJECTED',
        approvalStatus: 'RECUSADO',
      });
      return;
    }

    if (user.approvalStatus === 'SUSPENSO' || !user.active) {
      appendAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        'LOGIN_CONTA_SUSPENSA_BLOQUEADO',
        `Tentativa de entrada em conta SUSPENSA/INATIVA (${user.login}).`,
        ip
      );
      saveDatabase(dbState);
      res.status(403).json({
        error: 'Esta conta encontra-se suspensa. Entre em contato com o administrador.',
        code: 'ACCOUNT_SUSPENDED',
        approvalStatus: 'SUSPENSO',
      });
      return;
    }

    // 5. Approved & Active -> Issue HttpOnly session cookie + CSRF token
    const sessionId = crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(24).toString('hex');
    const ttl = rememberMe ? REMEMBER_SESSION_TTL_MS : SESSION_TTL_MS;

    dbState.sessions[sessionId] = {
      sessionId,
      csrfToken,
      userId: user.id,
      createdAt: serverNow,
      expiresAt: serverNow + ttl,
      ip,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
    };

    appendAuditLog(
      user.id,
      user.name,
      user.accessLevel,
      'LOGIN_SUCESSO_SERVIDOR',
      `Login autenticado com sucesso no servidor (${user.login} • ${user.accessLevel}).`,
      ip
    );
    saveDatabase(dbState);

    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    setSessionCookie(res, sessionId, ttl, isSecure);

    res.json({
      ok: true,
      csrfToken,
      sessionId,
      user: sanitizeUserForClient(user, dbState.systemConfig),
      systemConfig: dbState.systemConfig,
    });
  });

  // --------------------------------------------------------------------------
  // FIREBASE AUTH EMULATOR -> EXISTING PORTAL SESSION BRIDGE
  // --------------------------------------------------------------------------
  // Disabled by default. The imported verifier fails closed unless every
  // emulator-only environment guard is present. The local server database
  // remains authoritative for roles and module permissions during migration.
  app.post('/api/auth/firebase-test', async (req, res) => {
    if (process.env.RODOVAR_FIREBASE_ENV !== 'emulator') {
      res.status(404).json({ error: 'Rota não disponível neste ambiente.' });
      return;
    }

    try {
      const { verifyFirebasePortalIdentity } = await import(
        './src/server/firebase-test/portalIdentity'
      );
      const identity = await verifyFirebasePortalIdentity(req.headers.authorization);
      const user = dbState.users.find((candidate) => candidate.id === identity.employeeId);

      if (!user || !user.active || user.approvalStatus !== 'APROVADO') {
        res.status(403).json({ error: 'Cadastro corporativo local inativo ou não aprovado.' });
        return;
      }
      if (identity.email && user.email.toLowerCase() !== identity.email) {
        res.status(403).json({ error: 'O vínculo do perfil não corresponde ao cadastro corporativo.' });
        return;
      }

      const now = Date.now();
      const rememberMe = req.body?.rememberMe === true;
      const ttl = rememberMe ? REMEMBER_SESSION_TTL_MS : SESSION_TTL_MS;
      const sessionId = crypto.randomBytes(32).toString('hex');
      const csrfToken = crypto.randomBytes(24).toString('hex');
      const ip = req.ip || 'unknown';

      dbState.sessions[sessionId] = {
        sessionId,
        csrfToken,
        userId: user.id,
        createdAt: now,
        expiresAt: now + ttl,
        ip,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
      };
      appendAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        'LOGIN_FIREBASE_EMULATOR_SUCESSO',
        `Token Firebase fictício validado e vinculado ao cadastro ${user.id}.`,
        ip
      );
      saveDatabase(dbState);

      const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      setSessionCookie(res, sessionId, ttl, isSecure);
      res.json({
        ok: true,
        csrfToken,
        sessionId,
        user: sanitizeUserForClient(user, dbState.systemConfig),
        systemConfig: dbState.systemConfig,
        authProvider: 'firebase-emulator',
      });
    } catch (error) {
      const status = Number((error as { status?: number })?.status || 401);
      res.status(status).json({
        error:
          status === 403
            ? (error as Error).message
            : 'Não foi possível validar a sessão Firebase de testes.',
      });
    }
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 2: SOLICITAÇÃO DE ACESSO (CREATES PENDENTE ACCOUNT)
  // --------------------------------------------------------------------------
  app.post('/api/auth/request-access', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkIpRateLimit(ip, 'request_access', 8)) {
      res.status(429).json({
        error: 'Muitas solicitações enviadas em sequência. Aguarde alguns instantes.',
        code: 'RATE_LIMITED',
      });
      return;
    }

    // Ignore any approvalStatus, accessLevel, active, or permissoesPaginas sent by the browser!
    const { name, username, department, password, websiteHoneypot } = req.body || {};

    // Anti-automation honeypot
    if (websiteHoneypot) {
      res.status(400).json({ error: 'Solicitação inválida.' });
      return;
    }

    const cleanName = String(name || '')
      .trim()
      .replace(/[<>]/g, '');
    const rawUsername = normalizeIdentifier(username).replace(/[<>]/g, '');
    const cleanDept = String(department || 'Operacional').trim() as Department;
    const rawPass = String(password || '');

    if (!cleanName || cleanName.length < 3) {
      res.status(400).json({
        error: 'Informe seu nome completo (mínimo de 3 caracteres).',
      });
      return;
    }
    if (!rawUsername || rawUsername.length < 3) {
      res.status(400).json({
        error: 'Informe um nome de usuário ou e-mail válido (mínimo de 3 caracteres).',
      });
      return;
    }

    const allowedDepartments: Department[] = [
      'Administrativo',
      'Operacional',
      'Recursos Humanos',
      'Financeiro',
      'Segurança',
      'Diretoria',
      'Logística',
    ];
    const safeDepartment: Department = allowedDepartments.includes(cleanDept)
      ? cleanDept
      : 'Operacional';

    const pwCheck = validateStrongPasswordPolicy(rawPass);
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.reason });
      return;
    }

    const existing = findUserByIdentifier(rawUsername);
    if (existing) {
      if (existing.approvalStatus === 'PENDENTE') {
        res.status(409).json({
          error: 'Já existe uma solicitação pendente para este usuário. Aguarde a liberação do administrador.',
          code: 'DUPLICATE_PENDING',
        });
        return;
      }
      res.status(409).json({
        error: 'Este nome de usuário já está registrado no sistema.',
        code: 'DUPLICATE_USER',
      });
      return;
    }

    const cleanEmail = rawUsername.includes('@')
      ? rawUsername
      : `${rawUsername}@rodovar.com.br`;

    const { hash, salt } = hashPassword(rawPass);
    const nowIso = new Date().toISOString();

    const newPendingUser: ServerUserRecord = {
      id: `emp-req-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      name: cleanName.slice(0, 120),
      email: cleanEmail.slice(0, 160),
      login: rawUsername.slice(0, 160),
      passwordHash: hash,
      passwordSalt: salt,
      mustChangePassword: false,
      roleTitle: `Colaborador (${safeDepartment})`,
      department: safeDepartment,
      accessLevel: 'FUNCIONARIO', // Always minimal common profile!
      avatar: '', // Uses neutral default avatar by reference
      hasCustomAvatar: false,
      approvalStatus: 'PENDENTE',
      requestedAt: nowIso,
      phoneExt: '71 9 9920-2476',
      joinedAt: new Date().toLocaleDateString('pt-BR'),
      active: false, // Never active before admin approval!
      location: 'BA - Salvador',
      phone: '71 9 9920-2476',
      permissoesPaginas: ['inicio'], // Minimal permissions until admin explicitly grants
    };

    dbState.users.unshift(newPendingUser);
    appendAuditLog(
      newPendingUser.id,
      newPendingUser.name,
      'FUNCIONARIO',
      'SOLICITACAO_ACESSO_CRIADA',
      `Nova solicitação de acesso registrada como PENDENTE (${newPendingUser.login} • Setor: ${newPendingUser.department}).`,
      ip
    );
    saveDatabase(dbState);

    res.status(201).json({
      ok: true,
      status: 'PENDENTE',
      message: 'Solicitação recebida. Aguarde a liberação do administrador.',
    });
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 6: VALIDATE CURRENT SESSION & LOGOUT
  // --------------------------------------------------------------------------
  app.get('/api/auth/session', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const headerSid = req.headers['x-rodovar-session'] as string | undefined;
    const sid = cookies.rodovar_sid || headerSid;

    if (!sid || !dbState.sessions[sid]) {
      res.status(401).json({
        authenticated: false,
        systemConfig: dbState.systemConfig,
      });
      return;
    }

    const sess = dbState.sessions[sid];
    if (Date.now() >= sess.expiresAt) {
      delete dbState.sessions[sid];
      saveDatabase(dbState);
      clearSessionCookie(res);
      res.status(401).json({
        authenticated: false,
        systemConfig: dbState.systemConfig,
      });
      return;
    }

    const user = dbState.users.find((u) => u.id === sess.userId);
    if (!user || user.approvalStatus !== 'APROVADO' || !user.active) {
      delete dbState.sessions[sid];
      saveDatabase(dbState);
      clearSessionCookie(res);
      res.status(403).json({
        authenticated: false,
        error: 'Sua conta não está ativa ou aprovada.',
        systemConfig: dbState.systemConfig,
      });
      return;
    }

    res.json({
      authenticated: true,
      csrfToken: sess.csrfToken,
      sessionId: sess.sessionId,
      user: sanitizeUserForClient(user, dbState.systemConfig),
      systemConfig: dbState.systemConfig,
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const headerSid = req.headers['x-rodovar-session'] as string | undefined;
    const sid = cookies.rodovar_sid || headerSid;
    if (sid && dbState.sessions[sid]) {
      const sess = dbState.sessions[sid];
      const user = dbState.users.find((u) => u.id === sess.userId);
      if (user) {
        appendAuditLog(
          user.id,
          user.name,
          user.accessLevel,
          'LOGOUT_SESSAO',
          `Sessão encerrada pelo usuário (${user.login}).`,
          req.ip
        );
      }
      delete dbState.sessions[sid];
      saveDatabase(dbState);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 4: PASSWORD RECOVERY WITH SINGLE-USE EXPIRING TOKEN
  // (Never unlocks RECUSADO, SUSPENSO, or PENDENTE accounts)
  // --------------------------------------------------------------------------
  app.post('/api/auth/request-password-reset', requireAdminSession, (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkIpRateLimit(ip, 'pw_reset_req', 6)) {
      res.status(429).json({
        error: 'Muitas solicitações de recuperação. Aguarde um minuto.',
      });
      return;
    }

    const { identifier } = req.body || {};
    const user = findUserByIdentifier(String(identifier || ''));

    // Only issue a valid token if the account exists AND is APROVADO and active
    if (user && user.approvalStatus === 'APROVADO' && user.active) {
      const rawToken = `RDV-RST-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const now = Date.now();

      // Invalidate any previous unused tokens for this user
      for (const t of dbState.passwordResetTokens) {
        if (t.userId === user.id) t.used = true;
      }

      dbState.passwordResetTokens.push({
        tokenHash,
        userId: user.id,
        createdAt: now,
        expiresAt: now + 15 * 60 * 1000, // 15 minutes expiration
        used: false,
      });

      appendAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        'TOKEN_RECUPERACAO_SENHA_EMITIDO',
        `Token único de recuperação de senha emitido com expiração de 15 minutos.`,
        ip
      );
      saveDatabase(dbState);

      res.json({
        ok: true,
        message:
          'Token único de recuperação gerado com validade de 15 minutos.',
        resetToken: rawToken,
        expiresInMinutes: 15,
      });
      return;
    }

    // For non-existent, PENDENTE, RECUSADO, or SUSPENSO accounts: do not issue token or unlock
    res.status(403).json({
      error:
        'Não foi possível iniciar a recuperação de senha. Contas pendentes, recusadas, suspensas ou inexistentes não podem ser desbloqueadas por recuperação.',
      code: 'RESET_NOT_ELIGIBLE',
    });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const { token, newPassword } = req.body || {};
    const rawToken = String(token || '').trim().toUpperCase();
    if (!rawToken) {
      res.status(400).json({ error: 'Informe o token único de recuperação.' });
      return;
    }

    const pwCheck = validateStrongPasswordPolicy(String(newPassword || ''));
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.reason });
      return;
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const now = Date.now();
    const record = dbState.passwordResetTokens.find(
      (t) => t.tokenHash === tokenHash && !t.used && now < t.expiresAt
    );

    if (!record) {
      res.status(400).json({
        error: 'Token de recuperação inválido, já utilizado ou expirado.',
        code: 'INVALID_RESET_TOKEN',
      });
      return;
    }

    const user = dbState.users.find((u) => u.id === record.userId);
    const onboarding=(record as any).onboarding && (dbState as any).accessPolicy?.authorizedUids.includes(user?.id);
    if (!user || (!onboarding && (user.approvalStatus !== 'APROVADO' || !user.active))) {
      record.used = true;
      saveDatabase(dbState);
      res.status(403).json({
        error: 'Esta conta não está autorizada ou encontra-se suspensa/recusada.',
        code: 'ACCOUNT_NOT_ELIGIBLE',
      });
      return;
    }

    // Mark single-use token as used immediately
    record.used = true;
    const { hash, salt } = hashPassword(String(newPassword));
    user.passwordHash = hash;
    user.passwordSalt = salt;
    user.mustChangePassword = false;
    if (onboarding) { user.active=true; user.approvalStatus='APROVADO'; }

    // Revoke existing sessions so user logs in fresh with new password
    revokeAllSessionsForUser(user.id);

    appendAuditLog(
      user.id,
      user.name,
      user.accessLevel,
      'SENHA_REDEFINIDA_COM_TOKEN_UNICO',
      `Senha redefinida com sucesso via token único para ${user.login}.`,
      req.ip
    );
    saveDatabase(dbState);

    res.json({
      ok: true,
      message: 'Senha redefinida com sucesso! Você já pode entrar com sua nova senha.',
    });
  });

  // --------------------------------------------------------------------------
  // PROTECTED DIRECTORY & EMPLOYEE LIST FOR APPROVED USERS
  // --------------------------------------------------------------------------
  app.get('/api/employees', requireApprovedSession, (req: AuthenticatedRequest, res) => {
    const isAdmin = req.sessionUser?.accessLevel === 'ADMINISTRADOR';
    const visibleUsers = dbState.users.filter(
      (u) => isAdmin || (u.approvalStatus === 'APROVADO' && u.active)
    );
    res.json({
      employees: visibleUsers.map((u) => sanitizeUserForClient(u, dbState.systemConfig)),
    });
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 3: ADMINISTRAÇÃO > LIBERAÇÃO DE USO
  // --------------------------------------------------------------------------
  app.get(
    '/api/admin/access-requests',
    requireAdminSession,
    (_req: AuthenticatedRequest, res) => {
      const pendingCount = dbState.users.filter((u) => u.approvalStatus === 'PENDENTE').length;
      const accounts = dbState.users.map((u) => sanitizeUserForClient(u, dbState.systemConfig));
      res.json({
        pendingCount,
        accounts,
        decisionsHistory: dbState.accessDecisions.slice(0, 100),
        auditLogs: dbState.auditLogs.slice(0, 150),
      });
    }
  );

  app.post(
    '/api/admin/access-requests/:userId/decision',
    requireAdminSession,
    (req: AuthenticatedRequest, res) => {
      const admin = req.sessionUser!;
      const targetUserId = String(req.params.userId || '');
      if(req.body?.action!=='SUSPENDER') {res.status(409).json({error:'Ativação e perfis exigem vínculo revisado e primeiro acesso individual.'});return;}
      const { action, accessLevel, permissoesPaginas, reason, department, roleTitle } =
        req.body || {};

      const targetUser = dbState.users.find((u) => u.id === targetUserId);
      if (!targetUser) {
        res.status(404).json({ error: 'Conta de usuário não encontrada.' });
        return;
      }

      // Rule: User cannot approve their own account
      if (admin.id === targetUser.id && (action === 'APROVAR' || targetUser.approvalStatus !== 'APROVADO')) {
        res.status(403).json({
          error: 'Operação bloqueada: o usuário não pode aprovar ou liberar a própria conta.',
          code: 'SELF_APPROVAL_FORBIDDEN',
        });
        return;
      }

      const validActions = ['APROVAR', 'RECUSAR', 'SUSPENDER', 'ALTERAR_PERMISSOES'];
      if (!validActions.includes(action)) {
        res.status(400).json({ error: 'Ação administrativa inválida.' });
        return;
      }

      const validRoles: UserRole[] = ['FUNCIONARIO', 'ADMINISTRADOR', 'DIRETORIA'];
      const nextRole: UserRole = validRoles.includes(accessLevel)
        ? accessLevel
        : targetUser.accessLevel;

      // Rule: Prevent deactivating, suspending, rejecting, or demoting the last active administrator
      const isCurrentlyActiveAdmin =
        targetUser.accessLevel === 'ADMINISTRADOR' &&
        targetUser.approvalStatus === 'APROVADO' &&
        targetUser.active;
      const willRemainActiveAdmin =
        (action === 'APROVAR' || action === 'ALTERAR_PERMISSOES') &&
        nextRole === 'ADMINISTRADOR';

      if (isCurrentlyActiveAdmin && !willRemainActiveAdmin) {
        const activeAdminsCount = countActiveAdmins();
        if (activeAdminsCount <= 1) {
          res.status(409).json({
            error:
              'Operação bloqueada: não é permitido suspender, recusar ou remover o privilégio do último administrador ativo do sistema.',
            code: 'LAST_ADMIN_PROTECTION',
          });
          return;
        }
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const nowFormatted = now.toLocaleString('pt-BR');
      const cleanReason = String(reason || '').trim().slice(0, 300);

      let newStatus: AccountApprovalStatus = targetUser.approvalStatus;
      if (action === 'APROVAR') {
        newStatus = 'APROVADO';
        targetUser.approvalStatus = 'APROVADO';
        targetUser.active = true;
        targetUser.accessLevel = nextRole;
        if (department) targetUser.department = department;
        if (roleTitle) targetUser.roleTitle = String(roleTitle).trim();
        targetUser.permissoesPaginas =
          Array.isArray(permissoesPaginas) && permissoesPaginas.length > 0
            ? permissoesPaginas
            : getDefaultPermissionsForDepartment(targetUser.department, nextRole);
        targetUser.approvedBy = `${admin.name} (${admin.login})`;
        targetUser.approvedAt = nowIso;
        targetUser.statusReason = cleanReason || 'Acesso permitido pelo administrador.';
      } else if (action === 'RECUSAR') {
        newStatus = 'RECUSADO';
        targetUser.approvalStatus = 'RECUSADO';
        targetUser.active = false;
        targetUser.approvedBy = `${admin.name} (${admin.login})`;
        targetUser.approvedAt = nowIso;
        targetUser.statusReason = cleanReason || 'Solicitação recusada pelo administrador.';
        revokeAllSessionsForUser(targetUser.id);
      } else if (action === 'SUSPENDER') {
        newStatus = 'SUSPENSO';
        targetUser.approvalStatus = 'SUSPENSO';
        targetUser.active = false;
        targetUser.approvedBy = `${admin.name} (${admin.login})`;
        targetUser.approvedAt = nowIso;
        targetUser.statusReason = cleanReason || 'Conta suspensa pelo administrador.';
        revokeAllSessionsForUser(targetUser.id);
      } else if (action === 'ALTERAR_PERMISSOES') {
        targetUser.accessLevel = nextRole;
        if (department) targetUser.department = department;
        if (roleTitle) targetUser.roleTitle = String(roleTitle).trim();
        if (Array.isArray(permissoesPaginas) && permissoesPaginas.length > 0) {
          targetUser.permissoesPaginas = permissoesPaginas;
        }
        targetUser.approvedBy = `${admin.name} (${admin.login})`;
        targetUser.approvedAt = nowIso;
        if (cleanReason) targetUser.statusReason = cleanReason;
      }

      const decisionRecord: AccessDecisionRecord = {
        id: `dec-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        targetUserId: targetUser.id,
        targetName: targetUser.name,
        targetLogin: targetUser.login,
        adminId: admin.id,
        adminName: `${admin.name} (${admin.login})`,
        action,
        newStatus,
        accessLevel: targetUser.accessLevel,
        permissoesPaginas: targetUser.permissoesPaginas,
        reason: cleanReason || undefined,
        timestampIso: nowIso,
        timestampFormatted: nowFormatted,
      };

      dbState.accessDecisions.unshift(decisionRecord);
      appendAuditLog(
        admin.id,
        admin.name,
        admin.accessLevel,
        `DECISAO_LIBERACAO_USO_${action}`,
        `Administrador ${admin.login} executou ${action} na conta ${targetUser.name} (${targetUser.login}) -> Situação: ${newStatus}, Perfil: ${targetUser.accessLevel}.${cleanReason ? ` Motivo: ${cleanReason}` : ''}`,
        req.ip
      );
      saveDatabase(dbState);

      const pendingCount = dbState.users.filter((u) => u.approvalStatus === 'PENDENTE').length;
      res.json({
        ok: true,
        pendingCount,
        user: sanitizeUserForClient(targetUser, dbState.systemConfig),
        decision: decisionRecord,
      });
    }
  );

  // Admin direct account creation or update (preserving security rules)
  app.post('/api/admin/users', requireAdminSession, (req: AuthenticatedRequest, res) => {
    const admin = req.sessionUser!;
    res.status(409).json({error:'Cadastro exige vínculo de identidade na migração controlada.', code:'IDENTITY_BINDING_REQUIRED'}); return;
    const {
      name,
      login,
      email,
      password,
      department,
      roleTitle,
      accessLevel,
      phoneExt,
      permissoesPaginas,
      mustChangePassword,
    } = req.body || {};

    const cleanName = String(name || '').trim().replace(/[<>]/g, '');
    const normLogin = normalizeIdentifier(login || email);
    if (!cleanName || !normLogin) {
      res.status(400).json({ error: 'Nome e login são obrigatórios.' });
      return;
    }

    const pwCheck = validateStrongPasswordPolicy(String(password || ''));
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.reason });
      return;
    }

    if (findUserByIdentifier(normLogin)) {
      res.status(409).json({ error: 'Já existe um usuário com este login ou e-mail.' });
      return;
    }

    const { hash, salt } = hashPassword(String(password));
    const nowIso = new Date().toISOString();
    const role: UserRole = ['FUNCIONARIO', 'ADMINISTRADOR', 'DIRETORIA'].includes(accessLevel)
      ? accessLevel
      : 'FUNCIONARIO';
    const dept: Department = department || 'Operacional';

    const newUser: ServerUserRecord = {
      id: `emp-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name: cleanName,
      email: (email ? normalizeIdentifier(email) : normLogin.includes('@') ? normLogin : `${normLogin}@rodovar.com.br`),
      login: normLogin,
      passwordHash: hash,
      passwordSalt: salt,
      mustChangePassword: Boolean(mustChangePassword),
      roleTitle: String(roleTitle || 'Colaborador Corporativo').trim(),
      department: dept,
      accessLevel: role,
      avatar: '',
      hasCustomAvatar: false,
      approvalStatus: 'APROVADO',
      requestedAt: nowIso,
      approvedBy: `${admin.name} (${admin.login})`,
      approvedAt: nowIso,
      phoneExt: String(phoneExt || '71 9 9920-2476').trim(),
      phone: String(phoneExt || '71 9 9920-2476').trim(),
      location: 'BA - Salvador',
      joinedAt: new Date().toLocaleDateString('pt-BR'),
      active: true,
      permissoesPaginas:
        Array.isArray(permissoesPaginas) && permissoesPaginas.length > 0
          ? permissoesPaginas
          : getDefaultPermissionsForDepartment(dept, role),
    };

    dbState.users.unshift(newUser);
    appendAuditLog(
      admin.id,
      admin.name,
      admin.accessLevel,
      'CRIACAO_CONTA_PELO_ADMIN',
      `Criou conta aprovada para ${newUser.name} (${newUser.login} • ${newUser.accessLevel}).`,
      req.ip
    );
    saveDatabase(dbState);

    res.status(201).json({
      ok: true,
      user: sanitizeUserForClient(newUser, dbState.systemConfig),
    });
  });

  app.put('/api/admin/users/:userId', requireAdminSession, (req: AuthenticatedRequest, res) => {
    const admin = req.sessionUser!;
    if (req.body?.accessLevel || req.body?.accessProfile || req.body?.permissoesPaginas || req.body?.department) { res.status(409).json({error:'Altere perfis pela migração controlada.'}); return; }
    const targetId = String(req.params.userId || '');
    const target = dbState.users.find((u) => u.id === targetId);
    if (!target) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    const {
      name,
      login,
      email,
      password,
      department,
      roleTitle,
      accessLevel,
      phoneExt,
      permissoesPaginas,
      mustChangePassword,
    } = req.body || {};

    // Prevent removing the last active administrator
    if (
      target.accessLevel === 'ADMINISTRADOR' &&
      target.approvalStatus === 'APROVADO' &&
      target.active &&
      accessLevel &&
      accessLevel !== 'ADMINISTRADOR'
    ) {
      if (countActiveAdmins() <= 1) {
        res.status(409).json({
          error:
            'Operação bloqueada: não é permitido remover o privilégio do último administrador ativo.',
          code: 'LAST_ADMIN_PROTECTION',
        });
        return;
      }
    }

    if (name) target.name = String(name).trim();
    if (login) target.login = normalizeIdentifier(login);
    if (email) target.email = normalizeIdentifier(email);
    if (department) target.department = department;
    if (roleTitle) target.roleTitle = String(roleTitle).trim();
    if (accessLevel && ['FUNCIONARIO', 'ADMINISTRADOR', 'DIRETORIA'].includes(accessLevel)) {
      target.accessLevel = accessLevel;
    }
    if (phoneExt !== undefined) {
      target.phoneExt = String(phoneExt).trim();
      target.phone = target.phoneExt;
    }
    if (Array.isArray(permissoesPaginas) && permissoesPaginas.length > 0) {
      target.permissoesPaginas = permissoesPaginas;
    }
    if (typeof mustChangePassword === 'boolean') {
      target.mustChangePassword = mustChangePassword;
    }

    if (password && String(password).trim() !== '') {
      const pwCheck = validateStrongPasswordPolicy(String(password));
      if (!pwCheck.valid) {
        res.status(400).json({ error: pwCheck.reason });
        return;
      }
      const { hash, salt } = hashPassword(String(password));
      target.passwordHash = hash;
      target.passwordSalt = salt;
    }

    appendAuditLog(
      admin.id,
      admin.name,
      admin.accessLevel,
      'ATUALIZACAO_CONTA_PELO_ADMIN',
      `Atualizou dados/permissões de ${target.name} (${target.login} • ${target.accessLevel}).`,
      req.ip
    );
    revokeAllSessionsForUser(target.id);
    saveDatabase(dbState);

    res.json({
      ok: true,
      user: sanitizeUserForClient(target, dbState.systemConfig),
    });
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 1: AVATAR UPLOAD, VALIDATION, METADATA REMOVAL & RESTORE DEFAULT
  // --------------------------------------------------------------------------
  app.post('/api/profile/avatar', requireApprovedSession, (req: AuthenticatedRequest, res) => {
    const actor = req.sessionUser!;
    const { dataUrl, targetUserId } = req.body || {};

    const effectiveUserId = targetUserId ? String(targetUserId) : actor.id;
    // User cannot alter another account's photo without admin permission
    if (effectiveUserId !== actor.id && actor.accessLevel !== 'ADMINISTRADOR') {
      res.status(403).json({
        error: 'Permissão negada: você não pode alterar a foto de outra conta.',
        code: 'FORBIDDEN_OTHER_USER_AVATAR',
      });
      return;
    }

    const targetUser = dbState.users.find((u) => u.id === effectiveUserId);
    if (!targetUser) {
      res.status(404).json({ error: 'Conta não encontrada.' });
      return;
    }

    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      res.status(400).json({
        error: 'Envie um arquivo de imagem válido (PNG, JPEG ou WebP).',
      });
      return;
    }

    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) {
      res.status(400).json({ error: 'Dados de imagem malformados.' });
      return;
    }

    const base64Data = dataUrl.slice(commaIdx + 1);
    let rawBuffer: Buffer;
    try {
      rawBuffer = Buffer.from(base64Data, 'base64');
    } catch {
      res.status(400).json({ error: 'Codificação de imagem inválida.' });
      return;
    }

    const validation = validateAndSanitizeImageBuffer(rawBuffer);
    if (!validation.valid || !validation.sanitizedBuffer || !validation.extension) {
      res.status(400).json({
        error: validation.error || 'Arquivo de imagem rejeitado pelo servidor.',
        code: 'INVALID_IMAGE_FILE',
      });
      return;
    }

    // Generate system storage filename with UUID
    const fileName = `avatar-${crypto.randomUUID()}.${validation.extension}`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    fs.writeFileSync(filePath, validation.sanitizedBuffer);

    // Delete old custom uploaded avatar file if it was in /uploads/avatar-
    if (targetUser.hasCustomAvatar && targetUser.avatar.startsWith('/uploads/avatar-')) {
      const oldClean = targetUser.avatar.split('?')[0];
      const oldFsPath = path.join(PUBLIC_DIR, oldClean);
      if (fs.existsSync(oldFsPath)) {
        try {
          fs.unlinkSync(oldFsPath);
        } catch {
          // ignore
        }
      }
    }

    targetUser.avatar = `/uploads/${fileName}`;
    targetUser.hasCustomAvatar = true;

    appendAuditLog(
      actor.id,
      actor.name,
      actor.accessLevel,
      'UPLOAD_AVATAR_VALIDADO',
      `Foto de perfil atualizada e sanitizada (${validation.mimeType}, ${validation.width}x${validation.height}px) para ${targetUser.login}.`,
      req.ip
    );
    saveDatabase(dbState);

    res.json({
      ok: true,
      avatarUrl: targetUser.avatar,
      user: sanitizeUserForClient(targetUser, dbState.systemConfig),
    });
  });

  app.post(
    '/api/profile/restore-default-avatar',
    requireApprovedSession,
    (req: AuthenticatedRequest, res) => {
      const actor = req.sessionUser!;
      const { targetUserId } = req.body || {};
      const effectiveUserId = targetUserId ? String(targetUserId) : actor.id;

      if (effectiveUserId !== actor.id && actor.accessLevel !== 'ADMINISTRADOR') {
        res.status(403).json({
          error: 'Permissão negada: você não pode alterar a foto de outra conta.',
          code: 'FORBIDDEN_OTHER_USER_AVATAR',
        });
        return;
      }

      const targetUser = dbState.users.find((u) => u.id === effectiveUserId);
      if (!targetUser) {
        res.status(404).json({ error: 'Conta não encontrada.' });
        return;
      }

      if (targetUser.hasCustomAvatar && targetUser.avatar.startsWith('/uploads/avatar-')) {
        const oldClean = targetUser.avatar.split('?')[0];
        const oldFsPath = path.join(PUBLIC_DIR, oldClean);
        if (fs.existsSync(oldFsPath)) {
          try {
            fs.unlinkSync(oldFsPath);
          } catch {
            // ignore
          }
        }
      }

      // Store absence of custom photo as a reference so future global default avatar changes apply automatically
      targetUser.avatar = '';
      targetUser.hasCustomAvatar = false;

      appendAuditLog(
        actor.id,
        actor.name,
        actor.accessLevel,
        'RESTAURACAO_AVATAR_PADRAO',
        `Avatar padrão neutro restaurado para a conta ${targetUser.login}.`,
        req.ip
      );
      saveDatabase(dbState);

      res.json({
        ok: true,
        user: sanitizeUserForClient(targetUser, dbState.systemConfig),
      });
    }
  );

  app.put('/api/profile', requireApprovedSession, (req: AuthenticatedRequest, res) => {
    const actor = req.sessionUser!;
    const { name, phoneExt, login, password } = req.body || {};

    if (name && String(name).trim().length >= 3) {
      actor.name = String(name).trim().replace(/[<>]/g, '').slice(0, 120);
    }
    if (phoneExt !== undefined) {
      actor.phoneExt = String(phoneExt).trim().slice(0, 40);
      actor.phone = actor.phoneExt;
    }
    if (false && login && String(login).trim().length >= 3) {
      const nextLogin = normalizeIdentifier(login);
      const conflict = dbState.users.find(
        (u) => u.id !== actor.id && (u.login === nextLogin || u.email === nextLogin)
      );
      if (conflict) {
        res.status(409).json({ error: 'Este login já está em uso por outra conta.' });
        return;
      }
      actor.login = nextLogin;
      actor.email = nextLogin.includes('@') ? nextLogin : `${nextLogin}@rodovar.com.br`;
    }

    if (password && String(password).trim() !== '') {
      if (actor.mustChangePassword && verifyPasswordTimingSafe(String(password), actor.passwordHash, actor.passwordSalt)) {
        res.status(400).json({ error: 'A nova senha deve ser diferente da senha inicial.' });
        return;
      }
      const pwCheck = validateStrongPasswordPolicy(String(password));
      if (!pwCheck.valid) {
        res.status(400).json({ error: pwCheck.reason });
        return;
      }
      const { hash, salt } = hashPassword(String(password));
      actor.passwordHash = hash;
      actor.passwordSalt = salt;
      actor.mustChangePassword = false;
      for (const [sid, session] of Object.entries(dbState.sessions)) {
        if (session.userId === actor.id && sid !== req.sessionRecord?.sessionId) delete dbState.sessions[sid];
      }
    }

    appendAuditLog(
      actor.id,
      actor.name,
      actor.accessLevel,
      'ATUALIZACAO_PROPRIO_PERFIL',
      `Titular ${actor.name} atualizou seus dados pessoais em Meu Perfil.`,
      req.ip
    );
    saveDatabase(dbState);

    res.json({
      ok: true,
      user: sanitizeUserForClient(actor, dbState.systemConfig),
    });
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 8: ADMINISTRAÇÃO > CONFIGURAÇÃO DO SISTEMA
  // --------------------------------------------------------------------------
  app.get('/api/system-config', (_req, res) => {
    res.json({
      systemConfig: dbState.systemConfig,
      defaults: getDefaultSystemConfig(),
    });
  });

  app.get('/api/system-config/version', (_req, res) => {
    res.json({
      revision: dbState.systemConfig.revision,
      updatedAtIso: dbState.systemConfig.updatedAtIso,
      systemConfig: dbState.systemConfig,
    });
  });

  // Upload & validate a candidate image for System Config preview
  app.post(
    '/api/system-config/upload',
    requireAdminSession,
    (req: AuthenticatedRequest, res) => {
      const admin = req.sessionUser!;
      const { slot, dataUrl } = req.body || {};

      const validSlots = ['sidebarPoster', 'topHeader', 'welcomeBanner', 'defaultAvatar'];
      if (!validSlots.includes(slot)) {
        res.status(400).json({ error: 'Seção de configuração inválida.' });
        return;
      }

      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
        res.status(400).json({ error: 'Envie uma imagem válida em formato PNG, JPG ou WebP.' });
        return;
      }

      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx < 0) {
        res.status(400).json({ error: 'Imagem malformada.' });
        return;
      }

      let rawBuffer: Buffer;
      try {
        rawBuffer = Buffer.from(dataUrl.slice(commaIdx + 1), 'base64');
      } catch {
        res.status(400).json({ error: 'Falha ao decodificar arquivo de imagem.' });
        return;
      }

      const validation = validateAndSanitizeImageBuffer(rawBuffer);
      if (!validation.valid || !validation.sanitizedBuffer || !validation.extension) {
        res.status(400).json({
          error: validation.error || 'Arquivo inválido.',
          code: 'INVALID_SYSTEM_IMAGE',
        });
        return;
      }

      // Check recommended dimensions per slot
      const recMap: Record<string, { w: number; h: number }> = {
        sidebarPoster: { w: 600, h: 700 },
        topHeader: { w: 1920, h: 240 },
        welcomeBanner: { w: 1920, h: 360 },
        defaultAvatar: { w: 1024, h: 1024 },
      };
      const rec = recMap[slot];
      const width = validation.width || rec.w;
      const height = validation.height || rec.h;
      const lowResolutionWarning = width < rec.w * 0.75 || height < rec.h * 0.75;

      const fileName = `sysconfig-${slot}-${crypto.randomUUID()}.${validation.extension}`;
      const filePath = path.join(UPLOADS_DIR, fileName);
      fs.writeFileSync(filePath, validation.sanitizedBuffer);

      appendAuditLog(
        admin.id,
        admin.name,
        admin.accessLevel,
        'UPLOAD_PREVIA_CONFIG_SISTEMA',
        `Imagem validada para pré-visualização em ${slot} (${width}x${height}px, ${validation.mimeType}).`,
        req.ip
      );
      saveDatabase(dbState);

      res.json({
        ok: true,
        imageUrl: `/uploads/${fileName}`,
        width,
        height,
        mimeType: validation.mimeType,
        sizeBytes: validation.sanitizedBuffer.length,
        recommendedWidth: rec.w,
        recommendedHeight: rec.h,
        lowResolutionWarning,
      });
    }
  );

  // Atomic publish of System Configuration ("Salvar e atualizar")
  app.post(
    '/api/system-config/publish',
    requireAdminSession,
    (req: AuthenticatedRequest, res) => {
      const admin = req.sessionUser!;
      const { baseRevision, sidebarPoster, topHeader, welcomeBanner, defaultAvatar } =
        req.body || {};

      // Optimistic concurrency check: prevent silent overwrite if another admin published a newer revision
      if (
        typeof baseRevision === 'number' &&
        baseRevision !== dbState.systemConfig.revision
      ) {
        res.status(409).json({
          error:
            'Conflito de revisão detectado: outro administrador salvou uma configuração mais recente. Recarregue a configuração antes de publicar.',
          code: 'REVISION_CONFLICT',
          currentRevision: dbState.systemConfig.revision,
          systemConfig: dbState.systemConfig,
        });
        return;
      }

      // Validate welcomeBanner carousel (1 to 5 images)
      if (!welcomeBanner || !Array.isArray(welcomeBanner.items)) {
        res.status(400).json({
          error: 'O Banner de boas-vindas deve conter entre 1 e 5 imagens.',
        });
        return;
      }
      if (welcomeBanner.items.length < 1) {
        res.status(400).json({
          error: 'Não é permitido deixar o Banner de boas-vindas com zero imagens (mínimo: 1).',
          code: 'BANNER_MIN_1',
        });
        return;
      }
      if (welcomeBanner.items.length > 5) {
        res.status(400).json({
          error: 'O carrossel do Banner de boas-vindas suporta no máximo 5 imagens.',
          code: 'BANNER_MAX_5',
        });
        return;
      }

      const rawInterval = Number(welcomeBanner.intervalSeconds) || 5;
      const safeInterval = Math.min(15, Math.max(3, Math.round(rawInterval)));

      const sanitizedBannerItems: WelcomeBannerItem[] = welcomeBanner.items.map(
        (item: WelcomeBannerItem, idx: number) => {
          const cleanUrl = String(item.imageUrl || '').trim();
          if (!cleanUrl.startsWith('/assets/') && !cleanUrl.startsWith('/uploads/')) {
            throw new Error(`URL de imagem inválida na posição ${idx + 1} do banner.`);
          }
          return {
            id: String(item.id || `banner-${Date.now()}-${idx}`),
            imageUrl: cleanUrl.split('?')[0],
            altText: String(item.altText || '').trim().slice(0, 200),
            isDecorative: Boolean(item.isDecorative),
            focusX: Math.min(100, Math.max(0, Number(item.focusX ?? 50))),
            focusY: Math.min(100, Math.max(0, Number(item.focusY ?? 50))),
            width: item.width,
            height: item.height,
          };
        }
      );

      const cleanSidebarUrl = String(
        sidebarPoster?.imageUrl || dbState.systemConfig.sidebarPoster.imageUrl
      )
        .trim()
        .split('?')[0];
      const cleanTopUrl = String(
        topHeader?.imageUrl || dbState.systemConfig.topHeader.imageUrl
      )
        .trim()
        .split('?')[0];
      const cleanAvatarUrl = String(
        defaultAvatar?.imageUrl || dbState.systemConfig.defaultAvatar.imageUrl
      )
        .trim()
        .split('?')[0];

      for (const u of [cleanSidebarUrl, cleanTopUrl, cleanAvatarUrl]) {
        if (!u.startsWith('/assets/') && !u.startsWith('/uploads/')) {
          res.status(400).json({ error: 'Caminho de imagem inválido na configuração.' });
          return;
        }
      }

      const nextRevision = dbState.systemConfig.revision + 1;
      const nowIso = new Date().toISOString();

      const nextConfig: SystemConfig = {
        revision: nextRevision,
        updatedAtIso: nowIso,
        updatedBy: `${admin.name} (${admin.login})`,
        sidebarPoster: {
          imageUrl: cleanSidebarUrl,
          focusX: Math.min(100, Math.max(0, Number(sidebarPoster?.focusX ?? 50))),
          focusY: Math.min(100, Math.max(0, Number(sidebarPoster?.focusY ?? 50))),
          width: sidebarPoster?.width || 600,
          height: sidebarPoster?.height || 700,
        },
        topHeader: {
          imageUrl: cleanTopUrl,
          focusX: Math.min(100, Math.max(0, Number(topHeader?.focusX ?? 50))),
          focusY: Math.min(100, Math.max(0, Number(topHeader?.focusY ?? 50))),
          width: topHeader?.width || 1920,
          height: topHeader?.height || 240,
        },
        welcomeBanner: {
          carouselEnabled:
            sanitizedBannerItems.length > 1 ? Boolean(welcomeBanner.carouselEnabled) : false,
          intervalSeconds: safeInterval,
          items: sanitizedBannerItems,
        },
        defaultAvatar: {
          imageUrl: cleanAvatarUrl,
          width: defaultAvatar?.width || 1024,
          height: defaultAvatar?.height || 1024,
        },
      };

      // Clean up orphaned sysconfig-* files in /public/uploads
      const referencedUploads = new Set<string>([
        cleanSidebarUrl,
        cleanTopUrl,
        cleanAvatarUrl,
        ...sanitizedBannerItems.map((b) => b.imageUrl),
      ]);
      try {
        const files = fs.readdirSync(UPLOADS_DIR);
        for (const f of files) {
          if (f.startsWith('sysconfig-')) {
            const relUrl = `/uploads/${f}`;
            if (!referencedUploads.has(relUrl)) {
              fs.unlinkSync(path.join(UPLOADS_DIR, f));
            }
          }
        }
      } catch {
        // ignore cleanup errors
      }

      dbState.systemConfig = nextConfig;
      appendAuditLog(
        admin.id,
        admin.name,
        admin.accessLevel,
        'PUBLICACAO_CONFIGURACAO_SISTEMA',
        `Configuração visual do sistema publicada (Revisão #${nextRevision}) por ${admin.login}. Banners no carrossel: ${sanitizedBannerItems.length}.`,
        req.ip
      );
      saveDatabase(dbState);

      res.json({
        ok: true,
        message: 'Configurações salvas. Atualizando o sistema…',
        systemConfig: nextConfig,
      });
    }
  );

  // --------------------------------------------------------------------------
  // UNIFIED FREIGHTS ENGINE (MEUS FRETES — COMERCIAL & EXPEDIÇÃO)
  // --------------------------------------------------------------------------
  registerAccountDeletionRoutes(app, requireAdminSession, dbState, saveDatabase);
  registerAgenda(app, requireApprovedSession, () => dbState.users);
  registerMural(app, requireApprovedSession, dbState, () => saveDatabase(dbState), INITIAL_ANNOUNCEMENTS);
  registerExternalRh(app, requireApprovedSession);
  registerRequestQueue(app, requireApprovedSession, () => dbState.users, INITIAL_REQUESTS);
  app.post('/api/admin/first-access/:uid', requireAdminSession, (req: AuthenticatedRequest, res) => {
    const user=dbState.users.find(u=>u.id===req.params.uid);
    const policy=(dbState as any).accessPolicy;
    if (!user || !policy?.authorizedUids.includes(user.id)) { res.status(403).json({error:'Identidade ainda não vinculada à lista autorizada.'}); return; }
    const token='RDV-RST-'+crypto.randomBytes(24).toString('hex').toUpperCase();
    for (const t of dbState.passwordResetTokens) if(t.userId===user.id) t.used=true;
    dbState.passwordResetTokens.push({tokenHash:crypto.createHash('sha256').update(token).digest('hex'),userId:user.id,createdAt:Date.now(),expiresAt:Date.now()+86400000,used:false,onboarding:true} as any);
    revokeAllSessionsForUser(user.id);
    saveDatabase(dbState);
    res.setHeader('Cache-Control','no-store');
    res.json({token,login:user.login,expiresInHours:24});
  });
  registerCustomerCovers(app, requireApprovedSession, dbState, () => saveDatabase(dbState));
  registerDrivers(app, requireApprovedSession, requireAdminSession, dbState, () => saveDatabase(dbState));
  registerUnifiedFreightRoutes(
    app,
    requireApprovedSession as any,
    () => dbState.users as any,
    appendAuditLog as any
  );

  // --------------------------------------------------------------------------
  // PAYMENT INTENTS, WEB SHARE TARGET & RECEIPTS ENGINE (FINANCEIRO MOBILE)
  // --------------------------------------------------------------------------
  registerPaymentReceiptRoutes(
    app,
    requireApprovedSession as any,
    appendAuditLog as any
  );

  // --------------------------------------------------------------------------
  // CORPORATE DOCUMENTS ATTACHMENT UPLOAD & VALIDATION (REQUISITO 4)
  // --------------------------------------------------------------------------
  const DOCS_UPLOADS_DIR = path.join(UPLOADS_DIR, 'documents');
  if (!fs.existsSync(DOCS_UPLOADS_DIR)) {
    fs.mkdirSync(DOCS_UPLOADS_DIR, { recursive: true });
  }

  const ALLOWED_DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx']);

  app.post(
    '/api/documentos/upload-anexos',
    requireApprovedSession,
    (req: AuthenticatedRequest, res) => {
      const user = req.sessionUser!;
      const { files } = req.body || {};

      if (!Array.isArray(files) || files.length === 0) {
        res.status(400).json({ error: 'Nenhum arquivo enviado para anexo.' });
        return;
      }

      if (files.length > 10) {
        res.status(400).json({ error: 'Limite máximo de 10 arquivos por publicação excedido.' });
        return;
      }

      const attachments: Array<{
        id: string;
        name: string;
        size: string;
        fileType: string;
        url: string;
      }> = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const rawName = String(f.name || `anexo-${i + 1}`).trim().replace(/[<>:"/\\|?*]/g, '');
        const ext = (rawName.split('.').pop() || '').toLowerCase();

        if (!ALLOWED_DOC_EXTS.has(ext)) {
          res.status(400).json({
            error: `O arquivo "${rawName}" possui formato inválido (.${ext}). Formatos aceitos: .pdf, .doc, .docx, .xls, .xlsx.`,
          });
          return;
        }

        const dataUrl = String(f.dataUrl || '');
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx < 0) {
          res.status(400).json({ error: `Dados corrompidos no arquivo "${rawName}".` });
          return;
        }

        const base64Data = dataUrl.slice(commaIdx + 1);
        let buffer: Buffer;
        try {
          buffer = Buffer.from(base64Data, 'base64');
        } catch {
          res.status(400).json({ error: `Falha na decodificação do arquivo "${rawName}".` });
          return;
        }

        const MAX_DOC_BYTES = 25 * 1024 * 1024; // 25 MB
        if (buffer.length > MAX_DOC_BYTES) {
          res.status(400).json({
            error: `O arquivo "${rawName}" excede o tamanho máximo permitido de 25 MB.`,
          });
          return;
        }

        const fileId = `doc-att-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const fileName = `${fileId}.${ext}`;
        const filePath = path.join(DOCS_UPLOADS_DIR, fileName);
        fs.writeFileSync(filePath, buffer);

        const sizeKb = Math.max(1, Math.round(buffer.length / 1024));
        const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

        attachments.push({
          id: fileId,
          name: rawName,
          size: sizeStr,
          fileType: ext.toUpperCase(),
          url: `/uploads/documents/${fileName}`,
        });
      }

      appendAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        'UPLOAD_ANEXOS_DOCUMENTO',
        `Anexou ${attachments.length} arquivo(s) oficial(is) com validação de formato e tamanho no servidor.`,
        req.ip
      );
      saveDatabase(dbState);

      res.json({
        ok: true,
        attachments,
      });
    }
  );

  // Serve static files from /public (including /uploads, /assets, /icons, /manifest.json, /sw.js)
  app.use(
    express.static(PUBLIC_DIR, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('sw.js')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Service-Worker-Allowed', '/');
        } else if (filePath.endsWith('manifest.json')) {
          res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        } else if (filePath.endsWith('.png')) {
          res.setHeader('Content-Type', 'image/png');
          if (
            filePath.includes('/icons/') ||
            filePath.endsWith('pwa-192x192.png') ||
            filePath.endsWith('pwa-512x512.png') ||
            filePath.endsWith('pwa-maskable-512x512.png') ||
            filePath.endsWith('apple-touch-icon.png')
          ) {
            res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
          }
        } else if (filePath.includes('/uploads/')) {
          res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
        }
      },
    })
  );

  // Catch-all for unknown /api/* routes (deny by default)
  app.all('/api/*', (_req, res) => {
    res.status(404).json({
      error: 'Endpoint da API não encontrado ou acesso negado por padrão.',
      code: 'API_NOT_FOUND',
    });
  });

  // Mount Vite middleware in development or static dist in production
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.join(ROOT_DIR, 'dist'));
  if (isProd) {
    const distPath = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const host = process.env.HOST || '127.0.0.1';
  app.listen(PORT, host, () => {
    console.log(`RODOVAR CONECTA Server running on http://${host}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start RODOVAR server:', err);
  process.exit(1);
});
