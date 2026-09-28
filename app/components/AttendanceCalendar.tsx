import Link from "next/link";
import { firstWeekday, todayKst } from "@/lib/format";

// design.md 5.3 — 출석한 날짜만 accent로 칠하고, 미래 월로는 이동하지 않는다.

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function shiftMonth(year: number, month: number, delta: number) {
  const base = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1 };
}

export function AttendanceCalendar({
  year,
  month,
  presentDates,
  hrefFor,
  lastDay,
}: {
  year: number;
  month: number;
  presentDates: Set<string>;
  /** 월 이동 링크를 만드는 함수 — 페이지마다 쿼리 파라미터가 달라서 주입받는다. */
  hrefFor: (year: number, month: number) => string;
  lastDay: number;
}) {
  const today = todayKst();
  const [todayYear, todayMonth] = today.split("-").map(Number);

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const nextIsFuture =
    next.year > todayYear ||
    (next.year === todayYear && next.month > todayMonth);

  const leading = firstWeekday(year, month);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="stack">
      <div className="row-between">
        <Link href={hrefFor(prev.year, prev.month)} className="btn btn-secondary btn-sm">
          ← 이전 달
        </Link>
        <strong>
          {year}년 {month}월
        </strong>
        {nextIsFuture ? (
          <span className="btn btn-secondary btn-sm" aria-disabled="true" style={{ opacity: 0.4 }}>
            다음 달 →
          </span>
        ) : (
          <Link href={hrefFor(next.year, next.month)} className="btn btn-secondary btn-sm">
            다음 달 →
          </Link>
        )}
      </div>

      <div className="calendar">
        {WEEKDAYS.map((label) => (
          <div key={label} className="calendar-head">
            {label}
          </div>
        ))}

        {Array.from({ length: leading }, (_, index) => (
          <div key={`pad-${index}`} />
        ))}

        {Array.from({ length: lastDay }, (_, index) => {
          const day = index + 1;
          const iso = `${year}-${pad(month)}-${pad(day)}`;
          const present = presentDates.has(iso);
          const classes = [
            "calendar-cell",
            present ? "calendar-present" : "",
            iso === today ? "calendar-today" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={iso} className={classes} title={present ? `${iso} 출석` : iso}>
              {day}
            </div>
          );
        })}
      </div>

      <p className="caption faint">진하게 표시된 날짜가 출석한 날입니다.</p>
    </div>
  );
}
