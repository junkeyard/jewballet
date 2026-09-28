"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Banner } from "@/components/ui";
import { IDLE_STATE, type ActionState } from "@/lib/types";
import { searchMembers, type MemberMatch } from "@/app/check-in/actions";

// 체크인과 같은 4자리 조회를 쓰되, 여기서는 출석 처리 대신 본인 페이지로 보낸다.

export default function MemberLookup() {
  const [code, setCode] = useState("");
  const [members, setMembers] = useState<MemberMatch[]>([]);
  const [state, setState] = useState<ActionState>(IDLE_STATE);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (code.length !== 4) {
      setMembers([]);
      setState(IDLE_STATE);
      return;
    }

    let cancelled = false;
    startTransition(async () => {
      const result = await searchMembers(code);
      if (cancelled) return;
      setMembers(result.members);
      setState(result.state);
    });

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="stack">
      <label className="field">
        <span className="field-label">전화번호 뒤 4자리</span>
        <input
          className="input input-code"
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, 4))
          }
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          placeholder="예: 2162"
          autoComplete="off"
          autoFocus
          aria-label="전화번호 뒤 4자리"
        />
      </label>

      <Banner state={state} />

      {pending && members.length === 0 ? (
        <p className="caption faint">확인하는 중…</p>
      ) : null}

      {members.map((member) => (
        <Link
          key={member.id}
          href={`/member?id=${member.id}`}
          className="card card-link"
          style={{ minHeight: 64 }}
        >
          <span className="h3">{member.name}</span>
          {member.class_group_name ? (
            <span className="caption" style={{ display: "block" }}>
              {member.class_group_name}
            </span>
          ) : null}
        </Link>
      ))}

      <Link href="/" className="caption" style={{ marginTop: 8 }}>
        ← 처음으로
      </Link>
    </div>
  );
}
