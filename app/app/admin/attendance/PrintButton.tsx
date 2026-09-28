"use client";

// 인쇄 시에는 .no-print 영역이 전부 빠지고 출석부 표만 남는다(globals.css @media print).
export default function PrintButton() {
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={() => window.print()}
    >
      출석부 인쇄
    </button>
  );
}
