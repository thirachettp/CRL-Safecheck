import { NextResponse, type NextRequest } from "next/server";

// ต้นแบบ: ป้องกันทั้งเว็บด้วย Basic Auth (ข้อมูลพนักงานห้ามเปิดสาธารณะ)
// ยกเว้น cron และ ingest ที่มี token ของตัวเอง
export function proxy(req: NextRequest) {
  const user = process.env.APP_USER;
  const pass = process.env.APP_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    const [u, p] = atob(auth.slice(6)).split(":");
    if (u === user && p === pass) return NextResponse.next();
  }
  return new NextResponse("ต้องเข้าสู่ระบบ", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SafeCheck", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!api/cron|api/ingest|_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|icon-512.png|manifest.webmanifest|sw.js).*)"],
};
