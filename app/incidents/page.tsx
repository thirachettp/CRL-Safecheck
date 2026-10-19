import { redirect } from "next/navigation";

// หน้าจากต้นแบบรุ่นแรก ย้ายไป Dashboard แล้ว
export default function Page() {
  redirect("/dashboard");
}
