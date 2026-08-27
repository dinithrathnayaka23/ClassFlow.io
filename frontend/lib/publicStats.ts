// Server-side only: reads BACKEND_ORIGIN, which is not exposed to the browser.
export type PublicStats = {
  students: number;
  teachers: number;
  courses: number;
  assignments: number;
};

// Same origin the dev proxy rewrites to, so the landing page needs no environment file of
// its own. Read here rather than through lib/api because that helper targets the browser's
// same-origin /api path, which a server component cannot resolve.
const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8080";

/** How long a rendered page may keep its figures. They move slowly; freshness is not urgent. */
export const STATS_REVALIDATE_SECONDS = 300;

/**
 * The public counts behind the landing page's overview.
 *
 * Returns null rather than throwing if the API is unreachable. A marketing page that fails to
 * render because a backend is down would be a worse outcome than one that omits its figures,
 * so the caller falls back to prose instead.
 */
export async function getPublicStats(): Promise<PublicStats | null> {
  try {
    const response = await fetch(`${backendOrigin}/api/public/stats`, {
      next: { revalidate: STATS_REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;
    return (await response.json()) as PublicStats;
  } catch {
    return null;
  }
}
