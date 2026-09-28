import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Badge, EmptyState, Field, Section, TableScroll } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlans } from "@/lib/queries";
import { daysUntil, formatDate, formatPrice, todayKst } from "@/lib/format";
import type { EntitlementStatus, Member, Plan } from "@/lib/types";
import { adjustEntitlement, cancelEntitlement, grantEntitlement } from "../actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ member?: string; edit?: string }>;

const STATUS_LABEL: Record<
  EntitlementStatus,
  { text: string; tone: "success" | "warn" | "error" | "neutral" }
> = {
  active: { text: "사용중", tone: "success" },
  used_up: { text: "횟수 소진", tone: "warn" },
  expired: { text: "기간 종료", tone: "neutral" },
  cancelled: { text: "취소됨", tone: "error" },
};

type Row = {
  id: string;
  member_id: string;
  start_date: string;
  end_date: string;
  remaining_count: number;
  status: EntitlementStatus;
  memo: string | null;
  members: { name: string } | { name: string }[] | null;
  plans: { name: string; monthly_limit: number } | { name: string; monthly_limit: number }[] | null;
};

export default async function AdminEntitlementsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { member: preselected, edit } = await searchParams;
  const supabase = createSupabaseServerClient();
  const today = todayKst();

  const [plans, membersResult, entitlementsResult] = await Promise.all([
    getPlans(true),
    supabase
      .from("members")
      .select("id, name, phone_last4, status")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("entitlements")
      .select(
        "id, member_id, start_date, end_date, remaining_count, status, memo, members(name), plans(name, monthly_limit)",
      )
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const members = (membersResult.data ?? []) as Pick<
    Member,
    "id" | "name" | "phone_last4" | "status"
  >[];
  const rows = (entitlementsResult.data ?? []) as Row[];
  const editing = edit ? rows.find((row) => row.id === edit) : undefined;

  const name = (value: Row["members"] | Row["plans"]) => {
    const resolved = Array.isArray(value) ? value[0] : value;
    return resolved?.name ?? "—";
  };

  return (
    <div className="stack-lg">
      <Section
        title="수강권 부여"
        desc="상품을 고르면 횟수와 기간이 상품 기준으로 자동 적용됩니다. 특별 조건일 때만 아래 값을 채우세요."
      >
        <div className="card">
          <ActionForm action={grantEntitlement} submitLabel="수강권 부여" onSuccessReset>
            <div className="grid-2">
              <Field label="회원">
                <select
                  className="select"
                  name="member_id"
                  defaultValue={preselected ?? ""}
                  required
                >
                  <option value="">회원을 선택하세요</option>
                  {members.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} ({row.phone_last4})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="수강권 상품">
                <select className="select" name="plan_id" defaultValue="" required>
                  <option value="">상품을 선택하세요</option>
                  {plans.map((plan: Plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — {plan.monthly_limit}회 / {plan.duration_days}일 /{" "}
                      {formatPrice(plan.price)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="시작일">
                <input className="input" name="start_date" type="date" defaultValue={today} />
              </Field>
              <Field label="메모">
                <input className="input" name="memo" placeholder="선택 입력" />
              </Field>
              <Field label="횟수 직접 지정" hint="비워두면 상품 기본 횟수">
                <input className="input" name="remaining_count" type="number" min={0} />
              </Field>
              <Field label="기간 직접 지정 (일)" hint="비워두면 상품 기본 기간">
                <input className="input" name="duration_days" type="number" min={1} />
              </Field>
            </div>
          </ActionForm>
        </div>
      </Section>

      {editing ? (
        <Section
          title={`${name(editing.members)} — 수강권 정정`}
          desc="횟수를 잘못 차감했거나 기간을 연장할 때 씁니다."
          action={
            <Link href="/admin/entitlements" className="btn btn-secondary btn-sm">
              정정 닫기
            </Link>
          }
        >
          <div className="card">
            <ActionForm action={adjustEntitlement} submitLabel="정정 저장">
              <input type="hidden" name="id" value={editing.id} />
              <div className="grid-3">
                <Field label="남은 횟수">
                  <input
                    className="input"
                    name="remaining_count"
                    type="number"
                    min={0}
                    defaultValue={editing.remaining_count}
                    required
                  />
                </Field>
                <Field label="시작일">
                  <input
                    className="input"
                    name="start_date"
                    type="date"
                    defaultValue={editing.start_date}
                    required
                  />
                </Field>
                <Field label="종료일">
                  <input
                    className="input"
                    name="end_date"
                    type="date"
                    defaultValue={editing.end_date}
                    required
                  />
                </Field>
              </div>
              <p className="caption faint">
                횟수가 1회 이상이고 종료일이 오늘 이후이면 다시 사용중 상태가 됩니다.
              </p>
            </ActionForm>
          </div>
        </Section>
      ) : null}

      <Section title="수강권 목록" desc="최근 부여한 순서로 100건까지 보여줍니다.">
        {rows.length === 0 ? (
          <EmptyState>부여된 수강권이 없습니다.</EmptyState>
        ) : (
          <TableScroll>
            <table className="table">
              <thead>
                <tr>
                  <th>회원</th>
                  <th>상품</th>
                  <th>기간</th>
                  <th className="num">남은 횟수</th>
                  <th>상태</th>
                  <th>메모</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const status = STATUS_LABEL[row.status];
                  const remainingDays = daysUntil(row.end_date);
                  const expiringSoon =
                    row.status === "active" &&
                    remainingDays !== null &&
                    remainingDays >= 0 &&
                    remainingDays <= 7;

                  return (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/member?id=${row.member_id}`}>
                          {name(row.members)}
                        </Link>
                      </td>
                      <td>{name(row.plans)}</td>
                      <td>
                        {formatDate(row.start_date)} ~ {formatDate(row.end_date)}{" "}
                        {expiringSoon ? <Badge tone="warn">만료 임박</Badge> : null}
                      </td>
                      <td className="num">{row.remaining_count}</td>
                      <td>
                        <Badge tone={status.tone}>{status.text}</Badge>
                      </td>
                      <td>{row.memo ?? "—"}</td>
                      <td>
                        <div className="row">
                          <Link
                            href={`/admin/entitlements?edit=${row.id}`}
                            className="btn btn-secondary btn-sm"
                          >
                            정정
                          </Link>
                          {row.status !== "cancelled" ? (
                            <ActionForm
                              action={cancelEntitlement}
                              submitLabel="취소"
                              variant="danger"
                              inline
                              confirm="이 수강권을 취소할까요? 이미 기록된 출석은 그대로 남습니다."
                            >
                              <input type="hidden" name="id" value={row.id} />
                            </ActionForm>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>
    </div>
  );
}
