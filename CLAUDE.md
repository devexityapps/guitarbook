# Guitarbook

Phone-first PWA for organizing guitar song and lesson links (YouTube, Ultimate Guitar, Songsterr) and tracking when each was last opened.

**The spec is `SPEC.md`. Read it before doing anything.** It defines scope, data model, screens, link parsing, terms-of-service constraints and the build order.

## Repo rules
- Single repo with four parts: `app/`, `shared/`, `extension/`, `site/`. Each deploys independently.
- **Work only in `app/` and `shared/`** unless told otherwise. Don't scaffold anything in `extension/` or `site/`.
- Code needed by more than one part goes in `shared/`. No React or Firebase imports in `shared/`.
- Design references are in `design/`: screenshots of the mockups and the icon SVGs (`icon.svg`, plus `icon-small.svg` for 32px and below). Match the mockups' layout and colors.

## Working style
- Follow the build order in SPEC.md §8 **one step at a time**. Stop at the end of each step and tell me how to check it. Don't start the next step until I say so.
- When SPEC.md is silent or ambiguous, ask. Don't invent features.
- Keep dependencies few. Ask before adding anything beyond Vite, React, TypeScript, Firebase and a PWA plugin.
- Never commit secrets. Firebase config goes in `.env.local`, which is gitignored.
- I create the Firebase project and run `firebase login` myself. Ask me when you need either.
