import { headers } from "next/headers";

type Bucket = {
  count: number;
  resetAt: number;
};

// 메모리 기반 간이 제한. Vercel 단일 리전·소규모 학원 트래픽 전제이며,
// 인스턴스 재시작 시 초기화되는 한계는 감수한다(무차별 열거 속도만 낮추면 충분).
const buckets = new Map<string, Bucket>();

function prune(now: number) {
  if (buckets.size < 1000) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export async function getClientKey() {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");

  return forwarded?.split(",")[0]?.trim() || "local";
}

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  prune(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  return true;
}
