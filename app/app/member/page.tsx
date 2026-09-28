import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceCalendar } from "@/components/AttendanceCalendar";
import { Badge, EmptyState, PageHeader, Section, Stat } from "@/components/ui";
import { EMPTY_ATTENDANCE, EMPTY_ENTITLEMENT } from "@/lib/checkin-messages";
import {
  daysUntil,
  formatDate,
  formatDateTime,
  formatDday,
  formatPhone,
  monthRange,
  todayKst,
} from "@/lib/format";
import {
  getActiveEntitlement,
  getMember,
  getMonthlyAttendanceDates,
  getRecentAttendance,
} from "@/lib/queries";
import MemberLookup from "./MemberLookup";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string; month?: string }>;

/** 'YYYY-MM'을 받아 연·월로. 없거나 형식이 틀리면 이번 달. */
function resolveMonth(raw: string | undefined) {
  const today = todayKst();
  const fallback = {
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  };

  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return fallback;

  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  if (month < 1 || month > 12) return fallback;

  // 미래 월은 보여주지 않는다.
  if (year > fallback.year || (year === fallback.year && month > fallback.month)) {
    return fallback;
  }
  return { year, month };
}

export default async function MemberPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  if (!params.id) {
    return (
      <main className="page">
        <div className="page-narrow stack-lg">
          <PageHeader
            eyebrow="Member"
            title="회원 정보 확인"
            desc="전화번호 뒤 4자리를 입력하면 본인의 이용 현황을 볼 수 있습니다."
          />
          <MemberLookup />
        </div>
      </main>
    );
  }

  const member = await getMember(params.id);
  if (!member) notFound();

  const { year, month } = resolveMonth(params.month);
  const { lastDay } = monthRange(year, month);

  const [entitlement, recent, presentDates] = await Promise.all([
    getActiveEntitlement(member.id),
    getRecentAttendance(member.id, 5),
    getMonthlyAttendanceDates(member.id, year, month),
  ]);

  const remainingDays = daysUntil(entitlement?.end_date);
  const expiringSoon = remainingDays !== null && remainingDays <= 7;

  return (
    <main className="page">
      <div className="page-narrow stack-lg">
        <PageHeader
          eyebrow="Member"
          title={`${member.name}님의 이용 현황`}
          desc="현재 이용 상태와 최근 출석 기록을 확인할 수 있습니다."
        />

        <div className="card grid-3">
          <Stat
            label="남은 횟수"
            value={entitlement ? entitlement.remaining_count : "—"}
            sub={
              entitlement?.plans
                ? `총 ${entitlement.plans.monthly_limit}회 중`
                : "이용 가능한 수강권 없음"
            }
          />
          <Stat
            label="만료일"
            value={
              entitlement ? (
                <span className={expiringSoon ? "" : ""}>
                  {formatDday(entitlement.end_date)}
                </span>
              ) : (
                "—"
              )
            }
            small
            sub={
              entitlement ? (
                <>
                  {formatDate(entitlement.end_date)}까지{" "}
                  {expiringSoon ? <Badge tone="warn">만료 임박</Badge> : null}
                </>
              ) : null
            }
          />
          <Stat
            label="현재 이용권"
            value={
              <span style={{ fontSize: 18, fontFamily: "var(--font-sans)" }}>
                {entitlement?.plans?.name ?? "없음"}
              </span>
            }
            small
            sub={
              entitlement
                ? `${formatDate(entitlement.start_date)} 시작`
                : "수강권 등록 후 이용 가능합니다."
            }
          />
        </div>

        {!entitlement ? <EmptyState>{EMPTY_ENTITLEMENT}</EmptyState> : null}

        <Section title="회원 기본 정보">
          <div className="card stack">
            <div className="row-between">
              <span className="caption">이름</span>
              <strong>{member.name}</strong>
            </div>
            <div className="row-between">
              <span className="caption">연락처</span>
              <span className="mono">{formatPhone(member.phone)}</span>
            </div>
            <div className="row-between">
              <span className="caption">소속반</span>
              <span>{member.class_group_name ?? "미지정"}</span>
            </div>
            <div className="row-between">
              <span className="caption">등록일</span>
              <span>{formatDate(member.join_date)}</span>
            </div>
          </div>
        </Section>

        <Section title="월간 출석">
          <div className="card">
            <AttendanceCalendar
              year={year}
              month={month}
              lastDay={lastDay}
              presentDates={presentDates}
              hrefFor={(y, m) =>
                `/member?id=${member.id}&month=${y}-${String(m).padStart(2, "0")}`
              }
            />
          </div>
        </Section>

        <Section title="최근 출석 기록">
          {recent.length === 0 ? (
            <EmptyState>{EMPTY_ATTENDANCE}</EmptyState>
          ) : (
            <div className="card stack">
              {recent.map((row) => (
                <div key={row.id} className="row-between">
                  <span>{formatDate(row.attendance_date)}</span>
                  <span className="caption mono">
                    {formatDateTime(row.checkin_time)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Link href="/" className="caption">
          ← 처음으로
        </Link>
      </div>
    </main>
  );
}
