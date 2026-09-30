# Upgrade Plan

## Current state

Score: 5/10 (was 2/10) — working threaded comments (post, reply, like, sort,
validation) with tested logic and honest CI; data is in-memory only.

## Backlog

- P1: Edit own comments.
- P1: Component tests for the comments screen (jest-expo + @testing-library/react-native).
- P2: Basic spam guard (rate limit, repeated-text check).
- P2: Pagination / virtualised list (FlatList) for long threads.
- P2: Link the EAS project (`eas init`) so the preview build job can run.

## Done in this pass

- Fixed the app not bundling: aligned `expo-router`/`react-native`/`expo-constants`
  with SDK 53 and added missing `expo-font`, `expo-asset`, `query-string` deps.
- Comments screen backed by pure `lib/comments.ts` (validation, depth-capped replies,
  likes, sorting, relative time) with 10 vitest tests.
- CI runs `npm ci`, typecheck, lint, tests and an Android JS bundle without `|| true`;
  EAS job skips cleanly without `EXPO_TOKEN`; added `eas.json`, ESLint config, lockfile.

## Done in this pass (pass 2)

Score: 6/10 (was 5/10) — comments, likes and the author name now survive restarts; own comments can be deleted.

- Persistence: comments, liked ids and author name are stored with AsyncStorage (`@react-native-async-storage/async-storage` 2.1.2, SDK 53 version) through `lib/usePersistentState.ts`; loads are versioned and validated (`lib/persist.ts`, `isComment`, `pruneOrphans`) so corrupt storage falls back to the seed instead of crashing.
- Delete own comment (and its replies) when the name matches the saved author; still TODO: edit.
- Accessibility: labels for cancel-reply, sort chips and profile links (`accessibilityRole="link"`).
- Advisories: `overrides.postcss ^8.5.28` clears the PostCSS highs in Expo metro-config (minor bump). Remaining: `image-size` (metro, bundler-only), `uuid` via `xcode`, `decode-uri-component` via `query-string@7` — all need an Expo SDK major upgrade; not auto-fixed.
- Verified: typecheck, lint, 18 vitest tests, Android `expo export` bundle.
