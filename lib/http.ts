import { NextResponse } from "next/server";

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** ห่อ handler ให้ error ทุกชนิดกลายเป็น JSON ที่อ่านรู้เรื่อง */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e: any) {
      console.error(e);
      return fail(e?.message ?? "เกิดข้อผิดพลาด", 500);
    }
  };
}
