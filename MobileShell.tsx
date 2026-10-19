"use client";
import PcHeader from "./PcHeader";

/** หน้ามือถือ: บน PC แสดงเมนูด้านบนและจัดคอลัมน์กลางจอ */
export default function MobileShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="m-pc"><PcHeader /></div>
      <div className="m-shell">{children}</div>
    </>
  );
}
