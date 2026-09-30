# Upgrade Plan

## Current state

Score: 5/10 (was 2/10) — working threaded comments (post, reply, like, sort,
validation) with tested logic and honest CI; data is in-memory only.

## Backlog

- P0: Persist comments (AsyncStorage now; the comments backend API once it exists).
- P1: Edit/delete own comments (`removeComment` already exists in `lib/comments.ts`).
- P1: Component tests for the comments screen (jest-expo + @testing-library/react-native).
- P1: Remember the author name between posts; basic profanity/spam guard.
- P2: Pagination / virtualised list (FlatList) for long threads.
- P2: Link the EAS project (`eas init`) so the preview build job can run.

## Done in this pass

- Fixed the app not bundling: aligned `expo-router`/`react-native`/`expo-constants`
  with SDK 53 and added missing `expo-font`, `expo-asset`, `query-string` deps.
- Comments screen backed by pure `lib/comments.ts` (validation, depth-capped replies,
  likes, sorting, relative time) with 10 vitest tests.
- CI runs `npm ci`, typecheck, lint, tests and an Android JS bundle without `|| true`;
  EAS job skips cleanly without `EXPO_TOKEN`; added `eas.json`, ESLint config, lockfile.
