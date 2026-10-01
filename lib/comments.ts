/**
 * Pure comment-thread logic (no React Native imports) so it can be unit-tested.
 */

export interface Comment {
  id: string;
  parentId: string | null;
  author: string;
  body: string;
  createdAt: number;
  likes: number;
}

export interface ThreadNode extends Comment {
  replies: ThreadNode[];
}

export type SortOrder = "newest" | "oldest" | "top";

export const MAX_BODY_LENGTH = 500;
export const MAX_AUTHOR_LENGTH = 40;
/** Replies deeper than this are attached to the deepest allowed ancestor. */
export const MAX_DEPTH = 3;

export interface CommentInput {
  author: string;
  body: string;
  parentId?: string | null;
}

/** Returns human-readable validation errors; empty array means valid. */
export function validateComment({ author, body }: CommentInput): string[] {
  const errors: string[] = [];
  const name = author.trim();
  const text = body.trim();
  if (!name) errors.push("Name is required.");
  else if (name.length > MAX_AUTHOR_LENGTH) errors.push(`Name must be at most ${MAX_AUTHOR_LENGTH} characters.`);
  if (!text) errors.push("Comment cannot be empty.");
  else if (text.length > MAX_BODY_LENGTH) errors.push(`Comment must be at most ${MAX_BODY_LENGTH} characters.`);
  return errors;
}

function depthOf(comments: Comment[], id: string | null): number {
  let depth = 0;
  let current = id;
  const byId = new Map(comments.map((c) => [c.id, c]));
  const seen = new Set<string>();
  while (current) {
    const c = byId.get(current);
    // A parent cycle from corrupt storage used to loop forever here.
    if (!c || seen.has(current)) break;
    seen.add(current);
    depth += 1;
    current = c.parentId;
  }
  return depth;
}

/**
 * Adds a validated comment. Throws on invalid input or unknown parent.
 * Replies beyond MAX_DEPTH are re-parented to keep the thread readable.
 */
export function addComment(
  comments: Comment[],
  input: CommentInput,
  now: number,
  id: string,
): Comment[] {
  const errors = validateComment(input);
  if (errors.length) throw new Error(errors.join(" "));
  let parentId = input.parentId ?? null;
  if (parentId && !comments.some((c) => c.id === parentId)) {
    throw new Error(`Unknown parent comment: ${parentId}`);
  }
  while (parentId && depthOf(comments, parentId) >= MAX_DEPTH) {
    parentId = comments.find((c) => c.id === parentId)!.parentId;
  }
  return [
    ...comments,
    { id, parentId, author: input.author.trim(), body: input.body.trim(), createdAt: now, likes: 0 },
  ];
}

export function toggleLike(comments: Comment[], id: string, liked: boolean): Comment[] {
  return comments.map((c) =>
    c.id === id ? { ...c, likes: Math.max(0, c.likes + (liked ? 1 : -1)) } : c,
  );
}

/** Removes a comment and all of its descendants. */
export function removeComment(comments: Comment[], id: string): Comment[] {
  const doomed = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of comments) {
      if (c.parentId && doomed.has(c.parentId) && !doomed.has(c.id)) {
        doomed.add(c.id);
        grew = true;
      }
    }
  }
  return comments.filter((c) => !doomed.has(c.id));
}

const comparators: Record<SortOrder, (a: Comment, b: Comment) => number> = {
  newest: (a, b) => b.createdAt - a.createdAt,
  oldest: (a, b) => a.createdAt - b.createdAt,
  top: (a, b) => b.likes - a.likes || b.createdAt - a.createdAt,
};

/** Builds a tree; top-level comments use `order`, replies are always oldest-first. */
export function buildThread(comments: Comment[], order: SortOrder = "newest"): ThreadNode[] {
  const nodes = new Map<string, ThreadNode>(comments.map((c) => [c.id, { ...c, replies: [] }]));
  const roots: ThreadNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  const sortReplies = (list: ThreadNode[]) => {
    list.sort(comparators.oldest);
    list.forEach((n) => sortReplies(n.replies));
  };
  roots.forEach((n) => sortReplies(n.replies));
  return roots.sort(comparators[order]);
}

/** "just now", "5m ago", "3h ago", "2d ago", then an ISO date. */
export function formatRelativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  // Local calendar date (toISOString would show the UTC date, a day off
  // for evening comments east of UTC).
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "1 comment", "3 comments". */
export function commentCountLabel(n: number): string {
  return `${n} ${n === 1 ? "comment" : "comments"}`;
}

/** Type guard used when loading comments from local storage. */
export function isComment(value: unknown): value is Comment {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    (c.parentId === null || typeof c.parentId === "string") &&
    typeof c.author === "string" &&
    typeof c.body === "string" &&
    typeof c.createdAt === "number" &&
    Number.isFinite(c.createdAt) &&
    typeof c.likes === "number" &&
    c.likes >= 0
  );
}

/**
 * Keeps only comments whose ancestor chain reaches a top-level comment:
 * drops replies whose parent (or any ancestor) is missing, and parent
 * cycles from corrupt storage, which would otherwise vanish from the tree
 * or promote a grandchild to the top level.
 */
export function pruneOrphans(comments: Comment[]): Comment[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const ok = new Map<string, boolean>();
  const rooted = (start: Comment): boolean => {
    const path: string[] = [];
    let c: Comment | undefined = start;
    let result = false;
    while (c) {
      const known = ok.get(c.id);
      if (known !== undefined) {
        result = known;
        break;
      }
      if (path.includes(c.id)) break; // cycle
      path.push(c.id);
      if (c.parentId === null) {
        result = true;
        break;
      }
      c = byId.get(c.parentId);
    }
    for (const id of path) ok.set(id, result);
    return result;
  };
  return comments.filter(rooted);
}
