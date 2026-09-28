import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Badge, EmptyState, Field, Section, TableScroll } from "@/components/ui";
import { getPlans } from "@/lib/queries";
import { formatPrice } from "@/lib/format";
import { savePlan } from "../actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ edit?: string }>;

// 수강료 표를 Supabase 콘솔 없이 여기서 고치는 것이 이 탭의 목적이다.

export default async function AdminPlansPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { edit } = await searchParams;
  const plans = await getPlans();
  const editing = edit ? plans.find((plan) => plan.id === edit) : undefined;

  return (
    <div className="stack-lg">
      <Section
        title={editing ? `${editing.name} 수정` : "상품 추가"}
        desc="여기서 고친 값은 앞으로 부여하는 수강권에만 적용됩니다. 이미 부여된 수강권은 그대로입니다."
        action={
          editing ? (
            <Link href="/admin/plans" className="btn btn-secondary btn-sm">
              수정 닫기
            </Link>
          ) : null
        }
      >
        <div className="card">
          <ActionForm
            action={savePlan}
            submitLabel={editing ? "저장" : "상품 추가"}
            onSuccessReset={!editing}
            key={editing?.id ?? "new"}
          >
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <div className="grid-2">
              <Field label="상품 이름">
                <input
                  className="input"
                  name="name"
                  defaultValue={editing?.name ?? ""}
                  placeholder="예: 레벨1/입문반 주2회"
                  required
                />
              </Field>
              <Field label="종류">
                <select
                  className="select"
                  name="plan_type"
                  defaultValue={editing?.plan_type ?? "monthly"}
                >
                  <option value="monthly">정기권</option>
                  <option value="daily">일일권</option>
                </select>
              </Field>
              <Field label="횟수">
                <input
                  className="input"
                  name="monthly_limit"
                  type="number"
                  min={0}
                  defaultValue={editing?.monthly_limit ?? 8}
                  required
                />
              </Field>
              <Field label="이용 기간 (일)">
                <input
                  className="input"
                  name="duration_days"
                  type="number"
                  min={1}
                  defaultValue={editing?.duration_days ?? 30}
                  required
                />
              </Field>
              <Field label="가격 (원)">
                <input
                  className="input"
                  name="price"
                  type="number"
                  min={0}
                  step={1000}
                  defaultValue={editing?.price ?? 0}
                  required
                />
              </Field>
              <Field label="판매 상태">
                <span className="row" style={{ height: 48 }}>
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked={editing ? editing.is_active : true}
                    style={{ width: 20, height: 20 }}
                  />
                  <span className="caption">
                    체크하면 수강권 부여 화면의 목록에 나옵니다.
                  </span>
                </span>
              </Field>
            </div>
          </ActionForm>
        </div>
      </Section>

      <Section title="상품 목록" desc="가격이 높은 순입니다.">
        {plans.length === 0 ? (
          <EmptyState>등록된 상품이 없습니다.</EmptyState>
        ) : (
          <TableScroll>
            <table className="table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>종류</th>
                  <th className="num">횟수</th>
                  <th className="num">기간</th>
                  <th className="num">가격</th>
                  <th>판매</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>{plan.name}</td>
                    <td>{plan.plan_type === "daily" ? "일일권" : "정기권"}</td>
                    <td className="num">{plan.monthly_limit}회</td>
                    <td className="num">{plan.duration_days}일</td>
                    <td className="num">{formatPrice(plan.price)}</td>
                    <td>
                      <Badge tone={plan.is_active ? "success" : "neutral"}>
                        {plan.is_active ? "판매중" : "중지"}
                      </Badge>
                    </td>
                    <td>
                      <Link
                        href={`/admin/plans?edit=${plan.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        수정
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
