import { redirect } from "next/navigation";

// หน้าจากต้นแบบรุ่นแรก ย้ายไปหน้าตั้งค่าแล้ว
export default function Page() {
  redirect("/admin");
}
