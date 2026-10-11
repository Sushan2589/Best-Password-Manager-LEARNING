# Phase 07: Password generator and settings

Status: planned; requires approval.

## Scope

Extract the existing cryptographic password-generation logic into the shared package. Provide length, uppercase, lowercase, numbers, symbols, generation, and explicit copy. Do not duplicate randomness logic or use Math.random. Specify whether selected character classes are allowed or guaranteed; the current generator allows classes but does not guarantee every class appears.

Validate lengths/options and test rejection sampling. Persist only non-sensitive preferences if settings require storage. Popup-close locking remains the initial policy; changing key persistence requires a separately approved security design.

## Acceptance tests

- Requested length, allowed character sets, invalid/empty options, randomness source, rejection handling, and repeated generation.
- Copy feedback, accessible toggles, disabled invalid states, and no generated-password logs/storage.
- Shared web/extension generator behavior and compatibility.

Document changes and obtain approval before considering Phase 8 implementation.
