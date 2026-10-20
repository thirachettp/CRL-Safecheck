"use client";
import PcHeader from "./PcHeader";
import BottomNav from "./BottomNav";

/** หน้ามือถือ: บน PC แสดงเมนูด้านบนและจัดคอลัมน์กลางจอ */
export default function MobileShell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <>
      <div className="m-pc"><PcHeader /></div>
      <div className={`m-shell has-bnav${wide ? " wide" : ""}`}>{children}</div>
      <BottomNav />
    </>
  );
}
