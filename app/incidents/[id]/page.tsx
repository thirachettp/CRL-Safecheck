import { redirect } from "next/navigation";

// หน้าจากต้นแบบรุ่นแรก ย้ายไป Dashboard แล้ว
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/dashboard?id=${encodeURIComponent((await params).id)}`);
}
