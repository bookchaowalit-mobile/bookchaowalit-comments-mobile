import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  MAX_BODY_LENGTH,
  type Comment,
  type SortOrder,
  type ThreadNode,
  addComment,
  buildThread,
  commentCountLabel,
  formatRelativeTime,
  isComment,
  pruneOrphans,
  removeComment,
  toggleLike,
  validateComment,
} from "../../lib/comments";
import { isStringArray, listCodec, valueCodec } from "../../lib/persist";
import { usePersistentState } from "../../lib/usePersistentState";

const START = Date.now();
const SEED: Comment[] = [
  { id: "1", parentId: null, author: "Ann", body: "Love the new layout!", createdAt: START - 3 * 3_600_000, likes: 4 },
  { id: "2", parentId: "1", author: "Bob", body: "Same here, much easier to read.", createdAt: START - 2 * 3_600_000, likes: 1 },
  { id: "3", parentId: null, author: "Cat", body: "Could we get dark mode next?", createdAt: START - 20 * 60_000, likes: 2 },
];
const SORTS: SortOrder[] = ["newest", "oldest", "top"];
const commentsCodec = listCodec(isComment);
const likedCodec = valueCodec(isStringArray);
const authorCodec = valueCodec((v: unknown): v is string => typeof v === "string");

export default function CommentsScreen() {
  const [stored, setComments] = usePersistentState<Comment[]>("comments.v1", SEED, commentsCodec);
  const [likedIds, setLikedIds] = usePersistentState<string[]>("comments.liked.v1", [], likedCodec);
  const [author, setAuthor] = usePersistentState("comments.author.v1", "", authorCodec);
  const comments = useMemo(() => pruneOrphans(stored), [stored]);
  const liked = useMemo(() => new Set(likedIds), [likedIds]);
  const [order, setOrder] = useState<SortOrder>("newest");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const thread = useMemo(() => buildThread(comments, order), [comments, order]);
  const now = Date.now();

  const submit = () => {
    const input = { author, body, parentId: replyTo?.id ?? null };
    const problems = validateComment(input);
    setErrors(problems);
    if (problems.length) return;
    setComments((list) => addComment(list, input, Date.now(), `${Date.now()}-${list.length}`));
    setBody("");
    setReplyTo(null);
  };

  const like = (id: string) => {
    const isLiked = liked.has(id);
    setComments((list) => toggleLike(list, id, !isLiked));
    setLikedIds((ids) => (isLiked ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const remove = (id: string) => {
    setComments((list) => removeComment(list, id));
    if (replyTo?.id === id) setReplyTo(null);
  };

  const renderNode = (node: ThreadNode, depth: number) => (
    <View key={node.id} style={[styles.comment, { marginLeft: depth * 16 }]}>
      <Text style={styles.meta}>
        <Text style={styles.author}>{node.author}</Text> · {formatRelativeTime(node.createdAt, now)}
      </Text>
      <Text style={styles.body}>{node.body}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={`${liked.has(node.id) ? "Unlike" : "Like"} comment by ${node.author}`}
          accessibilityRole="button"
          accessibilityState={{ selected: liked.has(node.id) }}
          onPress={() => like(node.id)}
        >
          <Text style={styles.action}>♥ {node.likes}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Reply to ${node.author}`}
          accessibilityRole="button"
          onPress={() => setReplyTo(node)}
        >
          <Text style={styles.action}>Reply</Text>
        </Pressable>
        {author.trim() !== "" && node.author === author.trim() && (
          <Pressable
            accessibilityLabel={`Delete your comment and its replies`}
            accessibilityRole="button"
            onPress={() => remove(node.id)}
          >
            <Text style={styles.action}>Delete</Text>
          </Pressable>
        )}
      </View>
      {node.replies.map((r) => renderNode(r, depth + 1))}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.composer}>
        {replyTo && (
          <View style={styles.replyBanner}>
            <Text style={styles.replyText}>Replying to {replyTo.author}</Text>
            <Pressable accessibilityLabel="Cancel reply" accessibilityRole="button" onPress={() => setReplyTo(null)}>
              <Text style={styles.action}>Cancel</Text>
            </Pressable>
          </View>
        )}
        <TextInput
          accessibilityLabel="Your name"
          onChangeText={setAuthor}
          placeholder="Your name"
          style={styles.input}
          value={author}
        />
        <TextInput
          accessibilityLabel="Comment"
          maxLength={MAX_BODY_LENGTH}
          multiline
          onChangeText={setBody}
          placeholder="Write a comment…"
          style={[styles.input, styles.bodyInput]}
          value={body}
        />
        <Text style={styles.counter}>
          {body.trim().length}/{MAX_BODY_LENGTH}
        </Text>
        {errors.map((e) => (
          <Text accessibilityLiveRegion="polite" key={e} style={styles.error}>
            {e}
          </Text>
        ))}
        <Pressable accessibilityRole="button" onPress={submit} style={styles.button}>
          <Text style={styles.buttonText}>{replyTo ? "Post reply" : "Post comment"}</Text>
        </Pressable>
      </View>

      <View style={styles.sorts}>
        <Text style={styles.count}>{commentCountLabel(comments.length)}</Text>
        {SORTS.map((s) => (
          <Pressable
            accessibilityLabel={`Sort by ${s}`}
            accessibilityRole="button"
            accessibilityState={{ selected: s === order }}
            key={s}
            onPress={() => setOrder(s)}
            style={[styles.chip, s === order && styles.chipActive]}
          >
            <Text style={[styles.chipText, s === order && styles.chipTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      {thread.map((n) => renderNode(n, 0))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 16, gap: 12 },
  composer: { backgroundColor: "#fff", borderRadius: 12, padding: 12, gap: 8 },
  replyBanner: { flexDirection: "row", justifyContent: "space-between" },
  replyText: { color: "#555", fontStyle: "italic" },
  input: {
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  bodyInput: { minHeight: 72, textAlignVertical: "top" },
  counter: { alignSelf: "flex-end", color: "#666", fontSize: 12 },
  error: { color: "#C62828", fontSize: 13 },
  button: { backgroundColor: "#2F6DB5", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
  sorts: { flexDirection: "row", alignItems: "center", gap: 8 },
  count: { flex: 1, color: "#333", fontWeight: "600" },
  chip: { borderRadius: 14, borderWidth: 1, borderColor: "#2F6DB5", paddingHorizontal: 10, paddingVertical: 4 },
  chipActive: { backgroundColor: "#2F6DB5" },
  chipText: { color: "#2F6DB5", textTransform: "capitalize" },
  chipTextActive: { color: "#fff" },
  comment: { backgroundColor: "#fff", borderRadius: 10, padding: 12, gap: 4, marginTop: 4 },
  meta: { color: "#666", fontSize: 12 },
  author: { color: "#222", fontWeight: "700" },
  body: { color: "#222", fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: "row", gap: 16, marginTop: 4 },
  action: { color: "#2F6DB5", fontWeight: "600", paddingVertical: 4 },
});
