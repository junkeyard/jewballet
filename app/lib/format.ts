// 날짜·숫자 표기 유틸.
//
// 서버는 Vercel에서 UTC로 돌지만 DB(attendance_date, check_in_member)는 전부
// Asia/Seoul 기준이다. 화면에서 "오늘"을 말할 때도 반드시 KST로 맞춰야
// 자정 전후에 출석부가 하루 어긋나지 않는다.

const KST = "Asia/Seoul";

/** KST 기준 오늘 날짜를 'YYYY-MM-DD'로 돌려준다. */
export function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** 'YYYY-MM-DD' 문자열을 시간대 흔들림 없이 연·월·일로 쪼갠다. */
export function parseDateParts(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month, day };
}

/** 'YYYY-MM-DD' → '2026. 7. 22.' */
export function formatDate(isoDate: string | null | undefined) {
  if (!isoDate) return "—";
  const { year, month, day } = parseDateParts(isoDate);
  return `${year}. ${month}. ${day}.`;
}

/** 'YYYY-MM-DD' → '7/22(수)' — 표 안에서 좁게 쓸 때 */
export function formatDateShort(isoDate: string | null | undefined) {
  if (!isoDate) return "—";
  const { year, month, day } = parseDateParts(isoDate);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  ];
  return `${month}/${day}(${weekday})`;
}

/** timestamptz → KST '7/22 19:05' */
export function formatDateTime(timestamp: string | null | undefined) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

/**
 * 오늘(KST)로부터 대상 날짜까지 남은 일수. 오늘이면 0, 지났으면 음수.
 * 두 값 모두 KST 자정 기준이라 시차로 ±1 되는 일이 없다.
 */
export function daysUntil(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const target = parseDateParts(isoDate);
  const today = parseDateParts(todayKst());
  const targetUtc = Date.UTC(target.year, target.month - 1, target.day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

/** 만료일을 'D-7' / 'D-DAY' / '기간 종료'로 표기 */
export function formatDday(isoDate: string | null | undefined): string {
  const remaining = daysUntil(isoDate);
  if (remaining === null) return "—";
  if (remaining < 0) return "기간 종료";
  if (remaining === 0) return "D-DAY";
  return `D-${remaining}`;
}

/** 날짜 계산: 'YYYY-MM-DD'에 일수를 더한다 (시작일 포함 기간 계산용) */
export function addDays(isoDate: string, days: number): string {
  const { year, month, day } = parseDateParts(isoDate);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** 해당 월의 1일과 말일을 'YYYY-MM-DD'로 */
export function monthRange(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
    lastDay,
  };
}

/** 해당 월 1일의 요일 (0=일) */
export function firstWeekday(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

export function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}

/** 전화번호를 010-1234-5678 형태로. 형식이 다르면 원본 그대로 둔다. */
export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/** 전화번호에서 숫자만 남긴다 (저장용) */
export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}
