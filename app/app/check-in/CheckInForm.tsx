"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Banner } from "@/components/ui";
import { formatDate, formatDday, daysUntil } from "@/lib/format";
import { IDLE_STATE, type ActionState } from "@/lib/types";
import {
  checkIn,
  searchMembers,
  type CheckInSuccess,
  type MemberMatch,
} from "./actions";

// design.md 5.2 — 4자리를 다 치면 버튼 없이 바로 검색한다.
// 데스크 직원이 아니라 회원이 직접 쓰는 화면이라 조작 단계를 하나라도 줄인다.

export default function CheckInForm() {
  const [code, setCode] = useState("");
  const [members, setMembers] = useState<MemberMatch[]>([]);
  const [state, setState] = useState<ActionState>(IDLE_STATE);
  const [success, setSuccess] = useState<CheckInSuccess | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // 4자리가 채워진 시점에만 조회한다. 지우는 중에는 결과를 비운다.
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

  function reset() {
    setCode("");
    setMembers([]);
    setState(IDLE_STATE);
    setSuccess(null);
    inputRef.current?.focus();
  }

  function handleSelect(member: MemberMatch) {
    startTransition(async () => {
      const result = await checkIn(member.id, member.name);
      setState({ status: result.status, message: result.message });
      if (result.success) {
        setSuccess(result.success);
        setMembers([]);
        setCode("");
      }
    });
  }

  if (success) {
    const remainingDays = daysUntil(success.endDate);
    const expiringSoon = remainingDays !== null && remainingDays <= 7;

    return (
      <div className="stack">
        <Banner state={{ status: "success", message: "출석이 완료되었습니다." }} />

        <div className="card stack">
          <div>
            <p className="stat-label">{success.memberName}님</p>
            <h2 className="h2">오늘 출석 완료</h2>
          </div>

          <div className="grid-2">
            <div>
              <p className="stat-label">남은 횟수</p>
              <p className="stat-value">{success.remainingCount}</p>
              <p className="caption">회</p>
            </div>
            <div>
              <p className="stat-label">이용 기간</p>
              <p className="stat-value stat-value-sm">
                {formatDday(success.endDate)}
              </p>
              <p className={expiringSoon ? "caption" : "caption"}>
                {formatDate(success.endDate)}까지
              </p>
            </div>
          </div>

          {success.remainingCount === 0 ? (
            <Banner
              state={{
                status: "warn",
                message:
                  "이번 수강권의 마지막 횟수였습니다. 재등록 후 이용 가능합니다.",
              }}
            />
          ) : null}

          {expiringSoon && success.remainingCount > 0 ? (
            <Banner
              state={{
                status: "warn",
                message: `이용 기간이 ${formatDate(success.endDate)}에 종료됩니다. 재등록을 준비해 주세요.`,
              }}
            />
          ) : null}
        </div>

        <button type="button" className="btn btn-block" onClick={reset}>
          다음 사람 체크인
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <label className="field">
        <span className="field-label">전화번호 뒤 4자리</span>
        <input
          ref={inputRef}
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

      {members.length > 0 ? (
        <div className="stack">
          <p className="caption">본인을 선택해 주세요. 눌러서 바로 체크인</p>
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              className="card card-link"
              style={{
                minHeight: 64,
                textAlign: "left",
                cursor: "pointer",
                width: "100%",
              }}
              onClick={() => handleSelect(member)}
              disabled={pending}
            >
              <span className="h3">{member.name}</span>
              {member.class_group_name ? (
                <span className="caption" style={{ display: "block" }}>
                  {member.class_group_name}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {code.length > 0 && code.length < 4 ? (
        <p className="caption faint">4자리를 모두 입력하면 자동으로 찾습니다.</p>
      ) : null}

      <Link href="/" className="caption" style={{ marginTop: 8 }}>
        ← 처음으로
      </Link>
    </div>
  );
}
