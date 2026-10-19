import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** เก็บเป็น scrypt$<salt>$<hash> ไม่มีทางถอดกลับเป็นรหัสผ่านได้ */
export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, 32, OPTS);
  return `scrypt$${salt.toString("base64")}$${h.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string | null) {
  if (!stored) return false;
  const [kind, s, h] = stored.split("$");
  if (kind !== "scrypt" || !s || !h) return false;
  const want = Buffer.from(h, "base64");
  const got = await scrypt(pw, Buffer.from(s, "base64"), want.length, OPTS);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** กติการหัสผ่าน: อย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข ไม่ซ้ำรหัสพนักงาน */
export function passwordProblem(pw: string, code?: string) {
  if (typeof pw !== "string" || pw.length < 8) return "รหัสผ่านต้องยาวอย่างน้อย 8 ตัว";
  if (pw.length > 128) return "รหัสผ่านยาวเกินไป";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข";
  if (code && pw.toLowerCase().includes(code.toLowerCase())) return "รหัสผ่านห้ามมีรหัสพนักงานอยู่ในนั้น";
  return null;
}

/** รหัสผ่านชั่วคราวตอน Admin รีเซ็ต (อ่านง่าย ไม่มีตัวที่สับสน) */
export function tempPassword() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const D = "23456789";
  const b = randomBytes(10);
  let s = "";
  for (let i = 0; i < 8; i++) s += A[b[i] % A.length];
  return `${s.slice(0, 4)}-${s.slice(4)}${D[b[8] % D.length]}${D[b[9] % D.length]}`;
}
