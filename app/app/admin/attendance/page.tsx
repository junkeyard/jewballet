import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Badge, EmptyState, Field, Section, TableScroll } from "@/components/ui";
import PrintButton from "./PrintButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClassGroups } from "@/lib/queries";
import {
  formatDate,
  formatDateTime,
  monthRange,
  todayKst,
} from "@/lib/format";
import type { Member } from "@/lib/types";
import { addAttendance, cancelAttendance } from "../actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ month?: string; group?: string }>;

function resolveMonth(raw: string | undefined) {
  const today = todayKst();
  const fallback = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return fallback;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  if (month < 1 || month > 12) return fallback;
  return { year, month };
}

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const { year, month } = resolveMonth(params.month);
  const groupFilter = params.group ?? "";
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const { start, end, lastDay } = monthRange(year, month);
  const today = todayKst();

  const supabase = createSupabaseServerClient();
  const groups = await getClassGroups();

  // 출석부 대상 회원 — 활동중인 회원만, 소속반 필터 적용
  let membersQuery = supabase
    .from("members")
    .select("id, name, class_group_id")
    .eq("status", "active")
    .order("name");
  if (groupFilter) membersQuery = membersQuery.eq("class_group_id", groupFilter);

  // 출석 기록은 해당 월 전체를 한 번에 가져와 메모리에서 표로 편다.
  // 학원 규모(회원 수백 · 월 출석 수천)에서 월 단위 조회 1회면 충분하다.
  let attendanceQuery = supabase
    .from("attendance")
    .select("id, member_id, attendance_date, checkin_time, source, class_group_id")
    .gte("attendance_date", start)
    .lte("attendance_date", end)
    .order("checkin_time", { ascending: false });
  if (groupFilter) attendanceQuery = attendanceQuery.eq("class_group_id", groupFilter);

  const [membersResult, attendanceResult] = await Promise.all([
    membersQuery,
    attendanceQuery,
  ]);

  const members = (membersResult.data ?? []) as Pick<
    Member,
    "id" | "name" | "class_group_id"
  >[];
  const attendance = (attendanceResult.data ?? []) as {
    id: string;
    member_id: string;
    attendance_date: string;
    checkin_time: string;
    source: "qr" | "admin";
    class_group_id: string | null;
  }[];

  // member_id → 출석한 일(day) 집합
  const byMember = new Map<string, Set<number>>();
  for (const row of attendance) {
    const day = Number(row.attendance_date.slice(8, 10));
    const set = byMember.get(row.member_id) ?? new Set<number>();
    set.add(day);
    byMember.set(row.member_id, set);
  }

  const memberNames = new Map(members.map((m) => [m.id, m.name]));
  const recent = attendance.slice(0, 30);
  const days = Array.from({ length: lastDay }, (_, index) => index + 1);

  const monthHref = (delta: number) => {
    const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
    const key = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
    const query = new URLSearchParams({ month: key });
    if (groupFilter) query.set("group", groupFilter);
    return `/admin/attendance?${query}`;
  };

  return (
    <div className="stack-lg">
      <div className="no-print stack-lg">
        <Section
          title="수동 출석 등록"
          desc="QR을 못 찍었거나 지난 수업을 소급 입력할 때 씁니다. 횟수도 함께 차감됩니다."
        >
          <div className="card">
            <ActionForm action={addAttendance} submitLabel="출석 등록" onSuccessReset>
              <div className="grid-2">
                <Field label="회원">
                  <select className="select" name="member_id" defaultValue="" required>
                    <option value="">회원을 선택하세요</option>
                    {members.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="출석일" hint="미래 날짜는 등록할 수 없습니다.">
                  <input
                    className="input"
                    name="attendance_date"
                    type="date"
                    max={today}
                    defaultValue={today}
                  />
                </Field>
              </div>
            </ActionForm>
          </div>
        </Section>

        <Section title="출석부 보기">
          <form className="row" method="get">
            <Field label="월">
              <input className="input" name="month" type="month" defaultValue={monthKey} />
            </Field>
            <Field label="소속반">
              <select className="select" name="group" defaultValue={groupFilter}>
                <option value="">전체</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit" className="btn btn-secondary btn-sm">
              조회
            </button>
            <Link href={monthHref(-1)} className="btn btn-secondary btn-sm">
              ← 이전 달
            </Link>
            <Link href={monthHref(1)} className="btn btn-secondary btn-sm">
              다음 달 →
            </Link>
            <PrintButton />
          </form>
        </Section>
      </div>

      <Section
        title={`${year}년 ${month}월 출석부`}
        desc={`${members.length}명 · 출석 ${attendance.length}건${
          groupFilter
            ? ` · ${groups.find((g) => g.id === groupFilter)?.name ?? ""}`
            : ""
        }`}
      >
        {members.length === 0 ? (
          <EmptyState>해당 조건에 맞는 회원이 없습니다.</EmptyState>
        ) : (
          <TableScroll>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, zIndex: 2 }}>회원</th>
                  {days.map((day) => (
                    <th key={day} className="num">
                      {day}
                    </th>
                  ))}
                  <th className="num">계</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const present = byMember.get(member.id) ?? new Set<number>();
                  return (
                    <tr key={member.id}>
                      <td
                        style={{
                          position: "sticky",
                          left: 0,
                          background: "var(--surface)",
                        }}
                      >
                        {member.name}
                      </td>
                      {days.map((day) => (
                        <td key={day} className="num">
                          {present.has(day) ? "●" : ""}
                        </td>
                      ))}
                      <td className="num">
                        <strong>{present.size}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>

      <div className="no-print">
        <Section
          title="최근 출석 기록"
          desc="이 달의 최근 30건입니다. 잘못 찍힌 출석은 여기서 취소하면 횟수가 되돌아옵니다."
        >
          {recent.length === 0 ? (
            <EmptyState>이 달의 출석 기록이 없습니다.</EmptyState>
          ) : (
            <TableScroll>
              <table className="table">
                <thead>
                  <tr>
                    <th>회원</th>
                    <th>출석일</th>
                    <th>체크인 시각</th>
                    <th>경로</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => (
                    <tr key={row.id}>
                      <td>{memberNames.get(row.member_id) ?? "—"}</td>
                      <td>{formatDate(row.attendance_date)}</td>
                      <td className="mono">{formatDateTime(row.checkin_time)}</td>
                      <td>
                        <Badge tone={row.source === "admin" ? "info" : "neutral"}>
                          {row.source === "admin" ? "수동 등록" : "QR"}
                        </Badge>
                      </td>
                      <td>
                        <ActionForm
                          action={cancelAttendance}
                          submitLabel="출석 취소"
                          variant="danger"
                          inline
                          confirm="이 출석을 취소하고 횟수를 되돌릴까요?"
                        >
                          <input type="hidden" name="id" value={row.id} />
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Section>
      </div>
    </div>
  );
}
