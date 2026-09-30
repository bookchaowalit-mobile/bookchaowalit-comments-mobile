import { describe, expect, it } from "vitest";
import {
  MAX_BODY_LENGTH,
  MAX_DEPTH,
  type Comment,
  addComment,
  buildThread,
  formatRelativeTime,
  isComment,
  pruneOrphans,
  removeComment,
  toggleLike,
  validateComment,
  commentCountLabel,
} from "../comments";

const T0 = Date.UTC(2026, 0, 1);

function seed(): Comment[] {
  let list: Comment[] = [];
  list = addComment(list, { author: "Ann", body: "First!" }, T0, "a");
  list = addComment(list, { author: "Bob", body: "Second" }, T0 + 1000, "b");
  list = addComment(list, { author: "Cat", body: "Reply to Ann", parentId: "a" }, T0 + 3000, "c");
  list = addComment(list, { author: "Dan", body: "Earlier reply", parentId: "a" }, T0 + 2000, "d");
  return list;
}

describe("validateComment", () => {
  it("requires a name and body", () => {
    expect(validateComment({ author: " ", body: "" })).toHaveLength(2);
    expect(validateComment({ author: "Ann", body: "hi" })).toEqual([]);
  });

  it("enforces the length limit", () => {
    expect(validateComment({ author: "Ann", body: "x".repeat(MAX_BODY_LENGTH + 1) })).toHaveLength(1);
  });
});

describe("addComment", () => {
  it("trims input and starts with zero likes", () => {
    const [c] = addComment([], { author: "  Ann ", body: " hello " }, T0, "a");
    expect(c).toMatchObject({ author: "Ann", body: "hello", likes: 0, parentId: null });
  });

  it("rejects invalid comments and unknown parents", () => {
    expect(() => addComment([], { author: "", body: "x" }, T0, "a")).toThrow(/Name/);
    expect(() => addComment([], { author: "A", body: "x", parentId: "zz" }, T0, "a")).toThrow(/Unknown/);
  });

  it("caps nesting depth", () => {
    let list: Comment[] = addComment([], { author: "A", body: "root" }, T0, "0");
    for (let i = 1; i <= MAX_DEPTH + 2; i++) {
      list = addComment(list, { author: "A", body: `r${i}`, parentId: String(i - 1) }, T0 + i, String(i));
    }
    const deepest = list[list.length - 1];
    expect(Number(deepest.parentId)).toBeLessThan(MAX_DEPTH);
  });
});

describe("buildThread", () => {
  it("nests replies oldest-first and sorts roots", () => {
    const newest = buildThread(seed(), "newest");
    expect(newest.map((n) => n.id)).toEqual(["b", "a"]);
    expect(newest[1].replies.map((n) => n.id)).toEqual(["d", "c"]);
    expect(buildThread(seed(), "oldest").map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("sorts by likes for top", () => {
    const liked = toggleLike(seed(), "a", true);
    expect(buildThread(liked, "top")[0].id).toBe("a");
  });
});

describe("toggleLike / removeComment", () => {
  it("never goes below zero", () => {
    expect(toggleLike(seed(), "a", false).find((c) => c.id === "a")!.likes).toBe(0);
  });

  it("removes descendants", () => {
    expect(removeComment(seed(), "a").map((c) => c.id)).toEqual(["b"]);
  });
});

describe("formatRelativeTime", () => {
  it("formats buckets", () => {
    expect(formatRelativeTime(T0, T0 + 30_000)).toBe("just now");
    expect(formatRelativeTime(T0, T0 + 5 * 60_000)).toBe("5m ago");
    expect(formatRelativeTime(T0, T0 + 3 * 3_600_000)).toBe("3h ago");
    expect(formatRelativeTime(T0, T0 + 2 * 86_400_000)).toBe("2d ago");
    expect(formatRelativeTime(T0, T0 + 30 * 86_400_000)).toBe("2026-01-01");
  });
});

describe("storage guards", () => {
  it("isComment accepts stored comments and rejects malformed ones", () => {
    expect(seed().every(isComment)).toBe(true);
    expect(isComment({ id: "x", parentId: 1, author: "a", body: "b", createdAt: 0, likes: 0 })).toBe(false);
    expect(isComment({ id: "x", parentId: null, author: "a", body: "b", createdAt: NaN, likes: 0 })).toBe(false);
    expect(isComment(null)).toBe(false);
  });
  it("pruneOrphans removes replies to missing parents", () => {
    const list = seed().filter((c) => c.id !== "a");
    expect(pruneOrphans(list).map((c) => c.id)).toEqual(["b"]);
  });
});

describe("pass 3 edge cases", () => {
  const c = (id: string, parentId: string | null): Comment => ({ id, parentId, author: "a", body: "b", createdAt: 0, likes: 0 });
  it("prunes whole orphaned chains, not just the first level", () => {
    // "b" lost its parent "a"; "c" (reply to b) must go too instead of becoming top-level.
    const kept = pruneOrphans([c("root", null), c("b", "a"), c("c", "b"), c("r1", "root")]);
    expect(kept.map((x) => x.id)).toEqual(["root", "r1"]);
  });
  it("drops parent cycles and does not hang when replying into one", () => {
    const corrupt = [c("x", "y"), c("y", "x"), c("self", "self"), c("root", null)];
    expect(pruneOrphans(corrupt).map((x) => x.id)).toEqual(["root"]);
    const next = addComment(corrupt, { author: "a", body: "b", parentId: "x" }, 1, "new");
    expect(next).toHaveLength(5);
  });
  it("shows the local calendar date for older comments", () => {
    const prev = process.env.TZ;
    process.env.TZ = "Asia/Bangkok";
    try {
      const ts = Date.UTC(2025, 5, 1, 20, 0); // 2025-06-02 03:00 in Bangkok
      expect(formatRelativeTime(ts, ts + 30 * 86_400_000)).toBe("2025-06-02");
    } finally {
      process.env.TZ = prev;
    }
  });
  it("pluralises the comment count", () => {
    expect(commentCountLabel(1)).toBe("1 comment");
    expect(commentCountLabel(0)).toBe("0 comments");
  });
});
