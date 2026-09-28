import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Badge, EmptyState, Field, Section, TableScroll } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClassGroups } from "@/lib/queries";
import { saveClassGroup } from "../actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ edit?: string }>;

export default async function AdminGroupsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { edit } = await searchParams;
  const supabase = createSupabaseServerClient();
  const groups = await getClassGroups();
  const editing = edit ? groups.find((group) => group.id === edit) : undefined;

  // 반별 회원 수 — 비활성화해도 되는 반인지 판단할 근거로 보여준다.
  const { data: memberRows } = await supabase
    .from("members")
    .select("class_group_id")
    .eq("status", "active");

  const counts = new Map<string, number>();
  for (const row of memberRows ?? []) {
    const id = row.class_group_id as string | null;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return (
    <div className="stack-lg">
      <Section
        title={editing ? `${editing.name} 수정` : "반 추가"}
        desc="정렬값이 작을수록 목록 위에 옵니다."
        action={
          editing ? (
            <Link href="/admin/groups" className="btn btn-secondary btn-sm">
              수정 닫기
            </Link>
          ) : null
        }
      >
        <div className="card">
          <ActionForm
            action={saveClassGroup}
            submitLabel={editing ? "저장" : "반 추가"}
            onSuccessReset={!editing}
            key={editing?.id ?? "new"}
          >
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <div className="grid-3">
              <Field label="반 이름">
                <input
                  className="input"
                  name="name"
                  defaultValue={editing?.name ?? ""}
                  placeholder="예: 성인 오전"
                  required
                />
              </Field>
              <Field label="정렬">
                <input
                  className="input"
                  name="sort_order"
                  type="number"
                  defaultValue={editing?.sort_order ?? (groups.length + 1) * 10}
                />
              </Field>
              <Field label="운영 상태">
                <span className="row" style={{ height: 48 }}>
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked={editing ? editing.is_active : true}
                    style={{ width: 20, height: 20 }}
                  />
                  <span className="caption">체크 해제하면 신규 배정 목록에서 빠집니다.</span>
                </span>
              </Field>
            </div>
          </ActionForm>
        </div>
      </Section>

      <Section title="반 목록">
        {groups.length === 0 ? (
          <EmptyState>등록된 반이 없습니다.</EmptyState>
        ) : (
          <TableScroll>
            <table className="table">
              <thead>
                <tr>
                  <th>반 이름</th>
                  <th className="num">정렬</th>
                  <th className="num">소속 회원</th>
                  <th>상태</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td>{group.name}</td>
                    <td className="num">{group.sort_order}</td>
                    <td className="num">{counts.get(group.id) ?? 0}명</td>
                    <td>
                      <Badge tone={group.is_active ? "success" : "neutral"}>
                        {group.is_active ? "운영중" : "비활성"}
                      </Badge>
                    </td>
                    <td>
                      <Link
                        href={`/admin/groups?edit=${group.id}`}
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
        <p className="caption faint">
          반을 지우는 기능은 두지 않았습니다. 과거 출석 기록이 소속반을 참조하고 있어,
          지우는 대신 비활성으로 두는 것이 안전합니다.
        </p>
      </Section>
    </div>
  );
}
