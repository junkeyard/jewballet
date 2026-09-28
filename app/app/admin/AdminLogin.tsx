"use client";

import { ActionForm } from "@/components/ActionForm";
import { Field } from "@/components/ui";
import { signIn } from "./actions";

export default function AdminLogin() {
  return (
    <main className="page">
      <div className="page-narrow stack-lg">
        <header>
          <p className="eyebrow">Admin</p>
          <h1 className="h1">관리자 로그인</h1>
          <p className="desc">회원·수강권·출석을 관리하려면 로그인해 주세요.</p>
        </header>

        <div className="card">
          <ActionForm action={signIn} submitLabel="로그인" pendingLabel="확인 중…">
            <Field label="비밀번호">
              <input
                className="input"
                name="password"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                autoFocus
                required
              />
            </Field>
          </ActionForm>
        </div>

        <p className="caption faint">
          로그인 상태는 12시간 뒤 자동으로 풀립니다.
        </p>
      </div>
    </main>
  );
}
