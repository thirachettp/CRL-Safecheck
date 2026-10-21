import type { MetadataRoute } from "next";

/** ติดตั้งเป็นแอปบนหน้าจอโฮม (จำเป็นสำหรับการแจ้งเตือนบน iPhone) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CRL SafeCheck",
    short_name: "SafeCheck",
    description: "นับคนและติดตามผู้สูญหายเมื่อเกิดเหตุฉุกเฉิน",
    start_url: "/",
    display: "standalone",
    background_color: "#F3F2EE",
    theme_color: "#F3F2EE",
    lang: "th",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
