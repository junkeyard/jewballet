import type { ReactNode } from "react";
import type { ActionState } from "@/lib/types";

// design.md 4장 컴포넌트 정의를 그대로 옮긴 것. 새 컴포넌트를 만들기 전에
// design.md 4장에 정의를 먼저 추가한다.

export function PageHeader({
  eyebrow,
  title,
  desc,
  action,
}: {
  eyebrow: string;
  title: ReactNode;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <header style={{ marginBottom: 32 }}>
      <p className="eyebrow">{eyebrow}</p>
      <div className="row-between">
        <h1 className="h1">{title}</h1>
        {action}
      </div>
      {desc ? <p className="desc">{desc}</p> : null}
    </header>
  );
}

export function Section({
  title,
  desc,
  action,
  children,
}: {
  title: string;
  desc?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="stack">
      <div className="row-between">
        <div>
          <h2 className="h2">{title}</h2>
          {desc ? <p className="caption">{desc}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Banner({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;

  const icon = {
    success: "✓",
    warn: "!",
    error: "×",
    info: "i",
  }[state.status];

  return (
    <p className={`banner banner-${state.status}`} role="status">
      <span aria-hidden="true">{icon}</span>
      <span>{state.message}</span>
    </p>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="caption faint">{hint}</span> : null}
    </label>
  );
}

export function Stat({
  label,
  value,
  sub,
  small,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  small?: boolean;
}) {
  return (
    <div>
      <p className="stat-label">{label}</p>
      <p className={small ? "stat-value stat-value-sm" : "stat-value"}>
        {value}
      </p>
      {sub ? <p className="caption">{sub}</p> : null}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warn" | "error" | "info";
  children: ReactNode;
}) {
  const cls = tone === "neutral" ? "badge" : `badge badge-${tone}`;
  return <span className={cls}>{children}</span>;
}

/** 리스트가 비었을 때의 안내. design.md Do 체크리스트상 모든 리스트에 필수. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="banner banner-info">
      <span aria-hidden="true">i</span>
      <span>{children}</span>
    </p>
  );
}

export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="table-scroll">{children}</div>;
}
