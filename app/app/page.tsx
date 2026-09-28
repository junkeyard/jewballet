import Link from "next/link";
import { PageHeader } from "@/components/ui";

// design.md 5.1 / 6.1 — 히어로 1개 + 카드 3개.
// QR 체크인 카드를 첫 번째로 두고 라벨은 카드마다 다르게 쓴다.

const CARDS = [
  {
    href: "/check-in",
    label: "CHECK-IN",
    title: "QR 체크인",
    desc: "전화번호 뒤 4자리로 빠르게 출석 체크",
  },
  {
    href: "/member",
    label: "MEMBER",
    title: "회원 정보 확인",
    desc: "남은 횟수, 만료일, 출석 기록 확인",
  },
  {
    href: "/admin",
    label: "ADMIN",
    title: "관리자 페이지",
    desc: "회원 등록, 수강권 관리, 출석 관리",
  },
];

export default function HomePage() {
  return (
    <main className="page">
      <div className="page-narrow stack-lg">
        <PageHeader
          eyebrow="Jewballet Member System"
          title={
            <>
              QR 체크인으로 간편하게
              <br />
              출석과 수강 정보를 확인하세요
            </>
          }
          desc="입구 QR을 통해 빠르게 출석 체크를 하고, 남은 횟수와 이용 기간을 바로 확인할 수 있습니다."
        />

        <div className="stack">
          {CARDS.map((card) => (
            <Link key={card.href} href={card.href} className="card card-link">
              <p className="card-label">{card.label}</p>
              <h2 className="h3">{card.title}</h2>
              <p className="caption">{card.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
