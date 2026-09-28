"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/members", label: "회원" },
  { href: "/admin/entitlements", label: "수강권" },
  { href: "/admin/plans", label: "상품" },
  { href: "/admin/attendance", label: "출석부" },
  { href: "/admin/groups", label: "반 관리" },
];

export default function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav className="tabs">
      {TABS.map((tab) => {
        // '/admin'은 하위 경로 전부와 접두사가 겹치므로 정확히 일치할 때만 켠다.
        const active =
          tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? "tab tab-active" : "tab"}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
