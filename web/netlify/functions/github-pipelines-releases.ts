import type { ReleaseInfo } from "./github-pipelines-types";
import { gh, NIGHTLY_TAG_RE, RELEASE_OVERFETCH } from "./github-pipelines-helpers";

export async function fetchReleaseInfo(token: string, repo: string): Promise<ReleaseInfo> {
  let releaseTag: string | null = null;
  try {
    const rel = await gh(`/repos/${repo}/releases?per_page=${RELEASE_OVERFETCH}`, token);
    if (rel.ok) {
      const releases = (await rel.json()) as Array<{
        tag_name?: string;
        published_at?: string;
        created_at?: string;
        draft?: boolean;
      }>;
      const sortTime = (release: { published_at?: string; created_at?: string }): number => {
        if (release.published_at) return new Date(release.published_at).getTime();
        if (release.created_at) return new Date(release.created_at).getTime();
        return 0;
      };
      const candidates = (releases || [])
        .filter((release) => release.tag_name && NIGHTLY_TAG_RE.test(release.tag_name))
        .sort((a, b) => sortTime(b) - sortTime(a));
      releaseTag = candidates[0]?.tag_name ?? null;
    }
  } catch {
    // Non-fatal
  }

  try {
    const tagRes = await gh(`/repos/${repo}/tags?per_page=10`, token);
    if (tagRes.ok) {
      const tags = (await tagRes.json()) as Array<{ name: string }>;
      const match = (tags || []).find((tag) => NIGHTLY_TAG_RE.test(tag.name));
      if (match && (!releaseTag || match.name > releaseTag)) {
        releaseTag = match.name;
      }
    }
  } catch {
    // Non-fatal
  }

  let weeklyTag: string | null = null;
  try {
    const weeklyRes = await gh(`/repos/${repo}/releases/latest`, token);
    if (weeklyRes.ok) {
      const weekly = (await weeklyRes.json()) as { tag_name?: string };
      if (weekly.tag_name) weeklyTag = weekly.tag_name;
    }
  } catch {
    // Non-fatal
  }

  return { releaseTag, weeklyTag };
}
