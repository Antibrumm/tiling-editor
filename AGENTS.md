# Tiling editor — project guidance

## Setup and commands

- Use Node.js 26.11.1 or newer on the 26.x release line and npm. Install dependencies with `npm ci`.
- `npm run build` emits the regular Vite website and the self-contained `dist/tiling-editor.html`. `npm run build:portable` emits just the portable HTML, which must work when opened directly through `file://` without a server. `scripts/build-portable.mjs` uses esbuild to inline JavaScript, CSS, raw assets, and dynamic imports as a classic script; escape closing script/style tags when embedding content.
- Run `npm run dev` for the local preview at http://localhost:5173. Vite watches source changes and updates the browser.
- Run `npm run typecheck` for strict TypeScript checks, `npm test` for regression tests, and `npm run build` for the static app in `dist/`. `npm run check` runs all three plus the built-app smoke test. Use `npm run preview` to serve the built app locally at http://localhost:4173.
- `npm run test:watch` starts Vitest watch mode for regression tests. `vitest.config.ts` separates regression tests from built-app smoke tests; use native Vitest test callbacks and import TypeScript directly for model tests.
- Run `npm run format` to apply Prettier formatting and `npm run format:check` to verify it. `npm run check` enforces formatting before tests and builds. Use the project `.prettierrc.json`; exclude generated output through `.prettierignore`.
- Run `npm run lint` for the recommended ESLint and type-aware TypeScript rules; use `npm run lint:fix` for automatic fixes. `eslint.config.js` keeps browser and Node globals separate and defers formatting to Prettier. `npm run check` enforces linting before tests and builds.
- Read `README.md` and inspect the relevant source before making changes.

## Source and architecture

- Edit `src/editor.ts`, the TypeScript modules under `src/model/`, `src/codecs/`, and `src/rendering/`, `src/ui/`, `src/styles.css`, `docs/user.md`, `docs/developer.md`, and `index.html`. `vite.config.ts` configures development and builds. `dist/` is generated; regenerate it rather than editing it. Earlier HTML migration and Python patch scripts are not part of this project.
- Keep strict TypeScript checking enabled. Use explicit model and component types, typed DOM access, and dependency injection at module boundaries; avoid `any` and disabled-check directives. The production build runs typechecking before Vite. `npm run typecheck` checks application and test code with strict settings; Vitest and esbuild transpile tests for execution.
- The application uses Preact, `@preact/signals`, Canvas 2D, and Three.js. Keep the current stack unless the task calls for changing it.
- Documentation Markdown is sanitized with Marked and DOMPurify; `MermaidRenderer` lazily renders Mermaid blocks using strict security. Keep diagrams working offline in the portable build, retain source on rendering errors, and prevent late results from overwriting documentation navigation. `tests/mermaid.test.ts` covers lifecycle behavior.
- Put each class in its own TypeScript file. Prefer initialized classes with public instance methods for services, codecs, and utility APIs. Keep implementation helpers private. Avoid static utility methods and replacing class APIs with exported functions.
- `PlanService` owns persistent plain plan data and its mutations. Signals publish snapshots and represent interaction/selection state; Preact renders the controls.
- Keep persistent edits flowing through `PlanService`. Preserve semantic change events used for descriptions and reset behavior.
- Keep transient drag, pan, zoom, selection, and visibility state separate from serialized plan data. Do not overwrite unapplied YAML edits when another control changes the model.
- YAML and SVG codecs must preserve supported plan settings. Preserve compatibility with older plans, including the previous single-light representation and legacy Y-up placements.
- Startup creates an empty document. Loading a example or uploaded plan establishes the reset baseline; applying YAML changes the current document without redefining that baseline. Newly added items establish their own initial reset state.
- Derive canvas bounds from geometry rather than persisting them. Accept and ignore legacy YAML canvas blocks.

## Import, export, and validation

- Treat uploaded files and editable YAML as untrusted model input. Validate unique wall and pattern names, valid pattern references, usable outlines, and numeric dimensions at the model boundary. Wall names currently act as identifiers for lookup, selection, reset snapshots, and 3D caching.
- `YamlCodec` implements a limited, indentation-sensitive plan format rather than a general YAML parser. Do not assume general YAML syntax is supported; make unsupported input fail clearly when changing the codec.
- Test round trips against the full supported persistent model, including outline styling, pattern regions, placement, object depths, and lights. Comparing only a subset of fields can hide data loss. Include empty-document behavior when changing document import/export.
- Known gaps from the project review: YAML export omits outline fill/stroke/strokeWidth; SVG export/import omits pattern regions; empty-plan YAML export cannot be reimported; normalization accepts duplicate wall names. These are defects to address when relevant, not behavior to preserve.
- Bound rendering work for extreme imported dimensions and tiny tile sizes. Texture baking and per-tile painting must not perform unbounded work on the main thread.

## Geometry and rendering conventions

- Plan coordinates and light controls use millimeters; Three.js geometry uses meters. Convert at the rendering boundary.
- In 3D, the floor lies on XY and Z is height. Surface yaw rotates around Z; wall-local height becomes world Z.
- Preserve the T-unwrapped example assembly: floor, back wall, left and right walls, and the existing stepped floor boundaries. Wall front normals point into the room.
- Room-facing surfaces show tile textures; outside faces have an untextured white base color.
- Elements start at 10 mm depth. Smaller overlapping elements sit in front of their container elements, regardless of model order. Preserve explicit saved depths.
- Use the shared pattern-painting logic for 2D and 3D, including rotation, offsets, grout, and pattern regions.
- Reuse unchanged 3D meshes. Dispose removed or replaced geometry, materials, textures, and light helpers.
- Fit room preserves the current viewing angle and frames room geometry only. Perspective, Top, and Front explicitly change the angle.

## Lights and controls

- Keep Walls in a details section, followed by the 3D light placement section.
- Directional and conic lights have position XYZ, aim XYZ, color, and nonnegative intensity. Conic lights also have a full opening angle in degrees (1–179, default 60), converted to a half-angle in radians at the Three.js boundary. Intensity 0 disables either type. Preserve old plans as directional when the type is absent.
- Lights are selected through sidebar headers or visible source/aim markers. Keep light selection transient and mutually exclusive with wall/object selection; open the selected controls, exclude hidden markers from picking, and clear selection when the selected light is removed.
- Default and newly added lights aim at the floor's geometric center transformed into world coordinates. Preserve explicit saved custom aims.
- The Light sources toggle shows source markers, aim markers, and direction helpers. Toggling it does not change the light's illumination or camera framing.
- Keep light settings in plan serialization; helper visibility is presentation state. The soft hemisphere lighting remains active.

## Verification and working style

- Make focused changes and carry the requested behavior through controls, model, rendering, and serialization as applicable.
- Run `npm run check` after application or build changes. Add meaningful regression coverage when changing behavior; avoid tests that only repeat implementation details.
- For documentation-only changes, review the diff and verify referenced paths and commands; application tests are unnecessary unless code or runtime behavior also changes.
- `tests/portable.test.ts` verifies the handed-over HTML in isolation with no external resources. `npm run test:build` runs both website and portable smoke tests.
- Tests live in `tests/pattern.test.ts`, `tests/model.test.ts`, `tests/ui.test.ts`, `tests/build.test.ts`, and `tests/markdown.test.ts`. The build smoke test requires an existing `dist/` build and runs through `npm run check`. Model tests import actual TypeScript modules directly through Vitest; UI tests instrument and bundle `src/editor.ts` with its imports. UI instrumentation uses TypeScript syntax nodes so formatting changes do not break it; update it when refactoring the editor initialization or preview construction.
- UI tests use real Three.js geometry and controls but mock WebGL rendering. Passing tests does not verify GPU output. Visually inspect rendering changes in a real browser when available, and state when that check could not be performed.
- Keep dependencies pinned and update the lockfile when dependencies change. Keep `node_modules` and generated `dist` output out of Git.
- Continue routine, reversible work autonomously. Ask concise questions only when missing information materially changes the task. Report what changed, what was verified, and any remaining limitation.
