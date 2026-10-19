/** ข้อผิดพลาดที่ผู้ใช้แก้ได้เอง (ตอบ 400 พร้อมข้อความ ไม่ใช่ 500) */
export class UserError extends Error {
  status = 400;
}
