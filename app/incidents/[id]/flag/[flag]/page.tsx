import { redirect } from "next/navigation";

// ลิงก์ผู้นำธงจากต้นแบบรุ่นแรก ย้ายไปหน้าค้นหาแล้ว
export default function Page() {
  redirect("/search");
}
