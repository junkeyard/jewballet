"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Banner } from "@/components/ui";
import { IDLE_STATE, type ActionState } from "@/lib/types";

// design.md UX 원칙 — 오류·성공은 전체 리로드나 URL 파라미터가 아니라
// 폼 옆 인라인 배너로 보여준다.

type ServerAction = (
  prev: ActionState,
  formData: FormData,
) => Promise<ActionState>;

function SubmitButton({
  label,
  pendingLabel,
  variant,
  confirm,
}: {
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  const className = [
    "btn",
    variant === "secondary" ? "btn-secondary" : "",
    variant === "danger" ? "btn-danger" : "",
    variant ? "btn-sm" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(event) => {
        // 되돌리기 어려운 동작만 확인을 받는다(출석 취소·수강권 취소).
        if (confirm && !window.confirm(confirm)) {
          event.preventDefault();
        }
      }}
    >
      {pending ? (pendingLabel ?? "처리 중…") : label}
    </button>
  );
}

export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  variant,
  confirm,
  children,
  inline,
  onSuccessReset,
}: {
  action: ServerAction;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  confirm?: string;
  children?: ReactNode;
  /** 표 안의 행 단위 동작처럼 가로로 붙일 때 */
  inline?: boolean;
  /** 등록 폼처럼 성공 후 입력값을 비워야 할 때 */
  onSuccessReset?: boolean;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);

  return (
    <form
      action={formAction}
      className={inline ? "row" : "stack"}
      key={onSuccessReset && state.status === "success" ? state.message : "form"}
    >
      {children}
      <div className={inline ? "" : "row"}>
        <SubmitButton
          label={submitLabel}
          pendingLabel={pendingLabel}
          variant={variant}
          confirm={confirm}
        />
      </div>
      {!inline ? <Banner state={state} /> : null}
      {inline && state.status !== "idle" ? (
        <span
          className={`caption ${state.status === "success" ? "" : "faint"}`}
          role="status"
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
