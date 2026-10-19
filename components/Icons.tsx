// ไอคอนเส้นแบบเดียวกับ mockup
type P = { size?: number; color?: string; width?: number };
const S = ({ size = 20, color = "currentColor", width = 2, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const IFlag = (p: P) => <S {...p}><path d="M5 22V3" /><path d="M5 4h13l-3 4 3 4H5" /></S>;
export const ISearch = (p: P) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></S>;
export const IChart = (p: P) => <S {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></S>;
export const IPlus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const IBack = (p: P) => <S {...p}><path d="m15 18-6-6 6-6" /></S>;
export const ILock = (p: P) => <S {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></S>;
export const IDown = (p: P) => <S {...p} width={2.4}><path d="m6 9 6 6 6-6" /></S>;
export const IUp = (p: P) => <S {...p} width={2.4}><path d="m6 15 6-6 6 6" /></S>;
export const IUser = (p: P) => <S {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></S>;
export const IAlert = (p: P) => <S {...p} width={2.2}><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></S>;
export const IClose = (p: P) => <S {...p} width={2.4}><path d="M6 6l12 12M18 6 6 18" /></S>;
export const ICheck = (p: P) => <S {...p} width={3}><path d="M20 6 9 17l-5-5" /></S>;
export const IUpload = (p: P) => <S {...p} width={1.8}><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" /></S>;
export const IBuilding = (p: P) => <S {...p}><path d="M3 21V7l9-4 9 4v14M9 21v-6h6v6" /></S>;
export const IClock = (p: P) => <S {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></S>;
