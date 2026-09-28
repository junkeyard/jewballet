// Supabase 스키마(001 + 003 + 004 적용 후) 대응 타입.
// 스키마를 고치면 이 파일도 같이 고친다.

export type MemberStatus = "active" | "inactive" | "expired" | "dormant";
export type EntitlementStatus = "active" | "expired" | "used_up" | "cancelled";
export type PlanType = "monthly" | "daily";
export type AttendanceSource = "qr" | "admin";

export type ClassGroup = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type Member = {
  id: string;
  name: string;
  phone: string;
  phone_last4: string;
  class_group_id: string | null;
  join_date: string;
  status: MemberStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Plan = {
  id: string;
  name: string;
  plan_type: PlanType;
  monthly_limit: number;
  duration_days: number;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Entitlement = {
  id: string;
  member_id: string;
  plan_id: string;
  start_date: string;
  end_date: string;
  remaining_count: number;
  status: EntitlementStatus;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type Attendance = {
  id: string;
  member_id: string;
  entitlement_id: string;
  class_group_id: string | null;
  checkin_time: string;
  attendance_date: string;
  source: AttendanceSource;
  created_at: string;
};

export type RetentionReason =
  | "absent_14"
  | "absent_10"
  | "expiry_d3"
  | "expiry_d7"
  | null;

export type RetentionTarget = {
  member_id: string;
  name: string;
  phone: string;
  member_status: MemberStatus;
  last_attendance_date: string | null;
  entitlement_id: string | null;
  end_date: string | null;
  remaining_count: number | null;
  retention_reason: RetentionReason;
};

/** check_in_member() RPC의 반환 행 */
export type CheckInResult = {
  attendance_id: string;
  member_id: string;
  entitlement_id: string;
  remaining_count: number;
  end_date: string;
};

/** 서버 액션 공통 반환형 — useActionState로 인라인 배너에 그린다. */
export type ActionState = {
  status: "idle" | "success" | "warn" | "error" | "info";
  message: string;
  /** 성공 후 폼을 비우거나 목록을 갱신할 때 쓰는 값 */
  payload?: unknown;
};

export const IDLE_STATE: ActionState = { status: "idle", message: "" };
