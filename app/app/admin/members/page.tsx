import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Badge, EmptyState, Field, Section, TableScroll } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClassGroups } from "@/lib/queries";
import { formatDate, formatPhone, todayKst } from "@/lib/format";
import type { Member, MemberStatus } from "@/lib/types";
import { createMember, updateMember } from "../actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; edit?: string }>;

const STATUS_LABEL: Record<MemberStatus, { text: string; tone: "success" | "warn" | "neutral" }> = {
  active: { text: "활동중", tone: "success" },
  inactive: { text: "중지", tone: "neutral" },
  expired: { text: "만료", tone: "warn" },
  dormant: { text: "휴면", tone: "neutral" },
};

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { q = "", edit } = await searchParams;
  const supabase = createSupabaseServerClient();
  const groups = await getClassGroups();

  let query = supabase
    .from("members")
    .select("*, class_groups(name)")
    .order("name")
    .limit(200);

  const keyword = q.trim();
  if (keyword) {
    // 이름 부분일치 또는 전화번호 포함. 뒤 4자리만 쳐도 찾히게 한다.
    const digits = keyword.replace(/\D/g, "");
    query = digits
      ? query.or(`name.ilike.%${keyword}%,phone.ilike.%${digits}%`)
      : query.ilike("name", `%${keyword}%`);
  }

  const { data } = await query;
  const members = (data ?? []) as (Member & {
    class_groups: { name: string } | { name: string }[] | null;
  })[];

  const editing = edit ? members.find((m) => m.id === edit) : undefined;

  return (
    <div className="stack-lg">
      <Section title="회원 검색" desc="이름 또는 전화번호 일부로 찾습니다.">
        <form className="row" method="get">
          <input
            className="input"
            name="q"
            defaultValue={q}
            placeholder="이름 또는 전화번호"
            style={{ maxWidth: 280 }}
          />
          <button type="submit" className="btn btn-secondary btn-sm">
            검색
          </button>
          {keyword ? (
            <Link href="/admin/members" className="caption">
              검색 지우기
            </Link>
          ) : null}
        </form>
      </Section>

      {editing ? (
        <Section
          title={`${editing.name} 회원 정보 수정`}
          action={
            <Link href="/admin/members" className="btn btn-secondary btn-sm">
              수정 닫기
            </Link>
          }
        >
          <div className="card">
            <ActionForm action={updateMember} submitLabel="저장">
              <input type="hidden" name="id" value={editing.id} />
              <div className="grid-2">
                <Field label="이름">
                  <input className="input" name="name" defaultValue={editing.name} required />
                </Field>
                <Field label="연락처" hint="숫자만 입력해도 됩니다.">
                  <input
                    className="input"
                    name="phone"
                    defaultValue={editing.phone}
                    inputMode="numeric"
                    required
                  />
                </Field>
                <Field label="소속반">
                  <select
                    className="select"
                    name="class_group_id"
                    defaultValue={editing.class_group_id ?? ""}
                  >
                    <option value="">미지정</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                        {group.is_active ? "" : " (비활성)"}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="상태">
                  <select className="select" name="status" defaultValue={editing.status}>
                    {Object.entries(STATUS_LABEL).map(([value, meta]) => (
                      <option key={value} value={value}>
                        {meta.text}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="메모">
                <textarea
                  className="textarea"
                  name="notes"
                  defaultValue={editing.notes ?? ""}
                  placeholder="특이사항, 상담 내용 등"
                />
              </Field>
            </ActionForm>
          </div>
        </Section>
      ) : (
        <Section title="회원 등록">
          <div className="card">
            <ActionForm action={createMember} submitLabel="회원 등록" onSuccessReset>
              <div className="grid-2">
                <Field label="이름">
                  <input className="input" name="name" required />
                </Field>
                <Field label="연락처" hint="뒤 4자리가 체크인 번호가 됩니다.">
                  <input
                    className="input"
                    name="phone"
                    inputMode="numeric"
                    placeholder="01012345678"
                    required
                  />
                </Field>
                <Field label="소속반">
                  <select className="select" name="class_group_id" defaultValue="">
                    <option value="">미지정</option>
                    {groups
                      .filter((group) => group.is_active)
                      .map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="등록일">
                  <input
                    className="input"
                    name="join_date"
                    type="date"
                    defaultValue={todayKst()}
                  />
                </Field>
              </div>
              <Field label="메모">
                <textarea className="textarea" name="notes" placeholder="선택 입력" />
              </Field>
            </ActionForm>
          </div>
        </Section>
      )}

      <Section
        title="회원 목록"
        desc={`${members.length}명${keyword ? ` — '${keyword}' 검색 결과` : ""}`}
      >
        {members.length === 0 ? (
          <EmptyState>
            {keyword
              ? "검색 결과가 없습니다."
              : "등록된 회원이 없습니다. 위에서 먼저 등록해 주세요."}
          </EmptyState>
        ) : (
          <TableScroll>
            <table className="table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>연락처</th>
                  <th>소속반</th>
                  <th>상태</th>
                  <th>등록일</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const group = Array.isArray(member.class_groups)
                    ? member.class_groups[0]
                    : member.class_groups;
                  const status = STATUS_LABEL[member.status];
                  return (
                    <tr key={member.id}>
                      <td>{member.name}</td>
                      <td className="mono">{formatPhone(member.phone)}</td>
                      <td>{group?.name ?? "미지정"}</td>
                      <td>
                        <Badge tone={status.tone}>{status.text}</Badge>
                      </td>
                      <td>{formatDate(member.join_date)}</td>
                      <td>
                        <div className="row">
                          <Link
                            href={`/admin/members?${new URLSearchParams({
                              ...(keyword ? { q: keyword } : {}),
                              edit: member.id,
                            })}`}
                            className="btn btn-secondary btn-sm"
                          >
                            수정
                          </Link>
                          <Link
                            href={`/admin/entitlements?member=${member.id}`}
                            className="btn btn-secondary btn-sm"
                          >
                            수강권
                          </Link>
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
