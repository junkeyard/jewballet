import Link from "next/link";
import { isAdminSignedIn } from "@/lib/admin-session";
import AdminLogin from "./AdminLogin";
import { signOut } from "./actions";
import AdminTabs from "./AdminTabs";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 로그인 전에는 자식 페이지를 아예 렌더하지 않는다 — 데이터 조회도 일어나지 않는다.
  if (!(await isAdminSignedIn())) {
    return <AdminLogin />;
  }

  return (
    <main className="page">
      <div className="page-wide stack-lg">
        <header className="no-print">
          <p className="eyebrow">Admin</p>
          <div className="row-between">
            <h1 className="h1">회원 관리 및 수강권 운영</h1>
            <form action={signOut}>
              <button type="submit" className="btn btn-secondary btn-sm">
                로그아웃
              </button>
            </form>
          </div>
          <p className="desc">
            회원 등록, 수강권 관리, 출석 관리 및 리텐션 대상 확인
          </p>
        </header>

        <div className="no-print">
          <AdminTabs />
        </div>

        {children}

        <Link href="/" className="caption no-print">
          ← 처음으로
        </Link>
      </div>
    </main>
  );
}
