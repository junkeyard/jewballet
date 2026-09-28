import type { MetadataRoute } from "next";

// PWA 기본 — 홈 화면에 추가했을 때 앱처럼 열리게 한다. 서비스 워커(오프라인 캐시)는 두지 않는다:
// 체크인 결과가 캐시로 낡게 보이면 안 되고, 앱스토어 포장은 나중 단계의 일이다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "쥬발레아카데미 회원 시스템",
    short_name: "쥬발레",
    description: "입구 QR로 출석을 체크하고 남은 횟수와 이용 기간을 확인할 수 있습니다.",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf6f0",
    theme_color: "#faf6f0",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
