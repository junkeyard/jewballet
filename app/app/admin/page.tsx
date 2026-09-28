import Link from "next/link";
import { Badge, EmptyState, Section, Stat, TableScroll } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRetentionTargets } from "@/lib/queries";
import {
  formatDate,
  formatDateTime,
  formatDday,
  formatPhone,
  todayKst,
} from "@/lib/format";
import type { RetentionReason } from "@/lib/types";

export const dynamic = "force-dynamic";

// design.md 5.4 — 리텐션 사유별 컬러 뱃지
const REASON_LABEL: Record<Exclude<RetentionReason, null>, { text: string; tone: "warn" | "error" }> = {
  absent_14: { text: "14일 미출석", tone: "error" },
  absent_10: { text: "10일 미출석", tone: "warn" },
  expiry_d3: { text: "만료 D-3", tone: "error" },
  expiry_d7: { text: "만료 D-7", tone: "warn" },
};

/** 과거 수강권 이력은 있으나 지금 유효한 수강권이 없는 회원 = 재등록 후보 */
async function getRenewalCandidates() {
  const supabase = createSupabaseServerClient();
  const today = todayKst();

  const { data: withEntitlements } = await supabase
    .from("entitlements")
    .select("member_id, end_date, status, members(name, phone, status)")
    .order("end_date", { ascending: false });

  const rows = withEntitlements ?? [];
  const usable = new Set<string>();
  const lastEnd = new Map<string, string>();
  const info = new Map<string, { name: string; phone: string }>();

  for (const row of rows) {
    const memberId = row.member_id as string;
    const member = Array.isArray(row.members) ? row.members[0] : row.members;

    // 탈퇴·휴면 회원은 재등록 권유 대상이 아니다.
    if (!member || member.status !== "active") continue;

    if (!info.has(memberId)) {
      info.set(memberId, { name: member.name, phone: member.phone });
    }

    const endDate = row.end_date as string;
    if (row.status === "active" && endDate >= today) {
      usable.add(memberId);
    }
    if (!lastEnd.has(memberId)) {
      lastEnd.set(memberId, endDate);
    }
  }

  return [...info.entries()]
    .filter(([memberId]) => !usable.has(memberId))
    .map(([memberId, member]) => ({
      member_id: memberId,
      name: member.name,
      phone: member.phone,
      last_end_date: lastEnd.get(memberId) ?? null,
    }))
    .sort((a, b) => (b.last_end_date ?? "").localeCompare(a.last_end_date ?? ""))
    .slice(0, 20);
}

export default async function AdminDashboardPage() {
  const supabase = createSupabaseServerClient();
  const today = todayKst();

  const [
    todayAttendance,
    activeMembers,
    activeEntitlements,
    retention,
    renewals,
  ] = await Promise.all([
    supabase
      .from("attendance")
      .select("id, checkin_time, source, members(name), class_groups(name)")
      .eq("attendance_date", today)
      .order("checkin_time", { ascending: false }),
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("entitlements")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gte("end_date", today),
    getRetentionTargets(),
    getRenewalCandidates(),
  ]);

  const todayRows = todayAttendance.data ?? [];

  return (
    <div className="stack-lg">
      <div className="card grid-3">
        <Stat label="오늘 출석" value={todayRows.length} sub={`${formatDate(today)} 기준`} />
        <Stat
          label="활동 회원"
          value={activeMembers.count ?? 0}
          sub="상태가 활동중인 회원"
        />
        <Stat
          label="유효 수강권"
          value={activeEntitlements.count ?? 0}
          sub="기간이 남은 수강권"
        />
      </div>

      <Section title="오늘 출석" desc="가장 최근 체크인이 위에 옵니다.">
        {todayRows.length === 0 ? (
          <EmptyState>오늘 출석한 회원이 아직 없습니다.</EmptyState>
        ) : (
          <TableScroll>
            <table className="table">
              <thead>
                <tr>
                  <th>회원</th>
                  <th>소속반</th>
                  <th>체크인 시각</th>
                  <th>경로</th>
                </tr>
              </thead>
              <tbody>
                {todayRows.map((row) => {
                  const member = Array.isArray(row.members) ? row.members[0] : row.members;
                  const group = Array.isArray(row.class_groups)
                    ? row.class_groups[0]
                    : row.class_groups;
                  return (
                    <tr key={row.id as string}>
                      <td>{member?.name ?? "—"}</td>
                      <td>{group?.name ?? "미지정"}</td>
                      <td className="mono">{formatDateTime(row.checkin_time as string)}</td>
                      <td>
                        <Badge tone={row.source === "admin" ? "info" : "neutral"}>
                          {row.source === "admin" ? "수동 등록" : "QR"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>

      <Section
        title="연락 필요 회원"
        desc="오래 나오지 않았거나 만료가 가까운 회원입니다."
      >
        {retention.length === 0 ? (
          <EmptyState>지금 연락이 필요한 회원이 없습니다.</EmptyState>
        ) : (
          <TableScroll>
            <table className="table">
              <thead>
                <tr>
                  <th>회원</th>
                  <th>연락처</th>
                  <th>사유</th>
                  <th>마지막 출석</th>
                  <th>만료일</th>
                  <th className="num">남은 횟수</th>
                </tr>
              </thead>
              <tbody>
                {retention.map((row) => {
                  const reason = row.retention_reason
                    ? REASON_LABEL[row.retention_reason]
                    : null;
                  return (
                    <tr key={row.member_id}>
                      <td>
                        <Link href={`/member?id=${row.member_id}`}>{row.name}</Link>
                      </td>
                      <td className="mono">{formatPhone(row.phone)}</td>
                      <td>
                        {reason ? (
                          <Badge tone={reason.tone}>{reason.text}</Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{formatDate(row.last_attendance_date)}</td>
                      <td>
                        {row.end_date ? (
                          <>
                            {formatDate(row.end_date)}{" "}
                            <span className="caption">{formatDday(row.end_date)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num">{row.remaining_count ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>

      <Section
        title="재등록 후보"
        desc="지난 수강권 이력은 있으나 지금 쓸 수 있는 수강권이 없는 회원입니다."
      >
        {renewals.length === 0 ? (
          <EmptyState>재등록 후보가 없습니다.</EmptyState>
        ) : (
          <TableScroll>
            <table className="table">
              <thead>
                <tr>
                  <th>회원</th>
                  <th>연락처</th>
                  <th>마지막 수강권 종료</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {renewals.map((row) => (
                  <tr key={row.member_id}>
                    <td>
                      <Link href={`/member?id=${row.member_id}`}>{row.name}</Link>
                    </td>
                    <td className="mono">{formatPhone(row.phone)}</td>
                    <td>{formatDate(row.last_end_date)}</td>
                    <td>
                      <Link
                        href={`/admin/entitlements?member=${row.member_id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        수강권 부여
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>
    </div>
  );
}
