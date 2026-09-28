import { PageHeader } from "@/components/ui";
import CheckInForm from "./CheckInForm";

// design.md 5.2 — 헤더 최소, 푸터·네비게이션 없음.
export const dynamic = "force-dynamic";

export default function CheckInPage() {
  return (
    <main className="page">
      <div className="page-narrow stack-lg">
        <PageHeader
          eyebrow="Check-in"
          title="전화번호 뒤 4자리로 출석 체크"
          desc={"입구에서 빠르게 체크인할 수 있습니다.\n번호 입력 후 본인을 선택해주세요."}
        />
        <CheckInForm />
      </div>
    </main>
  );
}
