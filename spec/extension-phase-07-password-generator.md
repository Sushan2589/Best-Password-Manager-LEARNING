# Phase 07: Password generator and settings

Status: implemented under the user's combined approval for Phases 6–8.

## Scope

The popup Generator screen supports lengths 8–64 and lowercase, uppercase, numbers, and symbols. Generation and copying require explicit clicks. Invalid lengths or an empty set disable generation/copy and display an explanation. Changing options discards the previous output, so the displayed password always belongs to the displayed configuration.

The web application's existing algorithm was extracted into packages/shared/src/generator.ts and reused by both clients. crypto.getRandomValues supplies randomness, and rejection sampling avoids modulo bias using the exact 2^32 range. Selected character classes are allowed, not guaranteed to occur; both clients preserve that policy. No Math.random, remote service, password storage, or sensitive logging is involved. Length/type validation and a defensive faulty-provider limit were added. Existing web slider/toggles already satisfy these constraints, so its normal behavior remains compatible.

Generated output is popup React state only and disappears when leaving Generator or closing the popup. Preferences reset to length 20/all classes each time the screen opens; no storage permission was added for settings. Clipboard writes are explicit and errors are sanitized. Clipboard contents remain outside the popup-lock guarantee.

Settings retains vault locking and connection controls and now explains the filling/saving/clipboard policies. The vault still locks on popup closure; this phase does not persist keys or offer an unlock-duration setting. Filling without opening the popup and longer unlock sessions require the later lifecycle design requested by the user.

## Acceptance tests

- Requested length, allowed character sets, invalid/empty options, randomness source, rejection handling, and repeated generation.
- Copy feedback, accessible toggles, disabled invalid states, and no generated-password logs/storage.
- Shared web/extension generator behavior and compatibility.

## Implementation and checks

- packages/shared/src/generator.ts: shared crypto randomness/validation.
- apps/web/src/app/components/password-generator/PasswordGenerator.tsx: imports the shared generator; existing UI remains.
- apps/extension/src/popup/Generator.tsx: accessible controls, generation/copy feedback, ephemeral output.
- App.tsx: real Generator screen and settings policy copy.

Unit tests cover all classes, lengths, empty/invalid inputs, faulty randomness, and rejection/redraw. Browser tests check toggles, length, generation, copy feedback, disabled states, and output cleanup on navigation. Combined results are recorded in Phase 8.

Reload the built extension, open Generator, change the length/classes, generate, copy, and paste into a disposable local field. Clear it and your clipboard after checking. Switch away and return: output and preferences should reset. Check Chrome and Edge clipboard policies manually. No API restart is needed for Phase 7 alone.

## Validation record — 2026-10-11

All 14 shared generator unit cases passed. The packaged Generator browser case passed after narrowing its copy-feedback assertion to avoid the output element's implicit status role. The test checks generation, selected alphabet/length, explicit copy, empty-options disabled state, and leaving/reopening the screen. Web/extension TypeScript checks and extension development/production builds passed. Earlier screenshots confirmed the compact layout; native clipboard policy checks remain manual. Combined results are recorded in Phase 8.
