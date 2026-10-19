import { neon } from "@neondatabase/serverless";
import { SCHEMA } from "./schema";

type Row = Record<string, any>;
type Runner = (text: string, params?: unknown[]) => Promise<Row[]>;

let runner: Runner | null = null;
let schemaReady: Promise<void> | null = null;

function makeRunner(): Runner {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้งค่า DATABASE_URL");

  // Neon บน Vercel ใช้ HTTP driver (ไม่ค้าง connection ระหว่าง invocation)
  if (url.includes("neon.tech")) {
    const sql = neon(url);
    return async (text, params = []) => (await sql.query(text, params as any[])) as Row[];
  }

  // Postgres ทั่วไป (ใช้ตอนพัฒนาบนเครื่อง)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: url, max: 5 });
  return async (text, params = []) => (await pool.query(text, params)).rows;
}

/** รัน SQL หนึ่งคำสั่ง คืนแถวผลลัพธ์ สร้างตารางให้อัตโนมัติในครั้งแรก */
export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!runner) runner = makeRunner();
  if (!schemaReady) {
    const r = runner;
    schemaReady = (async () => {
      for (const stmt of SCHEMA) await r(stmt);
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  await schemaReady;
  return (await runner(text, params)) as T[];
}

export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}
