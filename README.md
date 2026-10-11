# Tiling editor

A Preact and Signals application for editing tiling plans in 2D and previewing them as a room in Three.js. This project contains the latest version from our work, including pattern rotation, the T-unwrapped room, layered elements, multiple configurable lights, white exterior faces, and camera-preserving room fitting.

## Start

Requires Node.js 20.19+ on the 20.x release line, or Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. Vite watches source files and updates the browser when they change. Use `npm run dev -- --port 5174` to change the port. The server binds to your local computer.

## Build and verify

To hand over the application as one file:

```sh
npm run build:portable
```

Give the recipient **`dist/tiling-editor.html`**. They can double-click it in Explorer to open the editor in their browser, without Node.js, a server, or an internet connection. The file includes styles, application code, Three.js, the template, and help documentation. They can load the template or upload a plan; include an exported YAML plan alongside the HTML if you want to share a particular document. The 3D preview requires WebGL 2.

`npm run build` produces both this portable file and the regular website build. The regular `dist/index.html` uses JavaScript modules and needs an HTTP server; use `tiling-editor.html` for opening directly from Explorer.

```sh
npm run format:check
npm run typecheck
npm test
npm run build
# Or run all checks, including the built app:
npm run check
```

The build produces a static application in `dist/`, with `index.html` and separate JavaScript and CSS assets. Run it locally through the preview server:

```sh
npm run build
npm run preview
```

Open http://localhost:4173. Preview serves the existing build; rebuild after source changes. Use `npm run preview -- --port 4174` to change the port. You can also serve `dist/` with another static HTTP server. Real 3D rendering requires a browser with WebGL 2.

## Formatting

Run `npm run format` to format source, tests, configuration, and documentation with Prettier. `npm run format:check` checks formatting without writing files and is included in `npm run check`. The project uses two spaces, single quotes, semicolons, trailing commas, a 100-character target width, and LF line endings. Generated `dist/` output and dependencies are excluded.

## Source layout

| Path                                                           | Purpose                                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/editor.ts`                                                | Application lifecycle, Preact controls, Signals state, dependency wiring                                 |
| `src/model/types.ts`, `src/model/events.ts`                    | Plan, geometry, selection, import, and semantic event types                                              |
| `src/model/plan-normalizer.ts`, `src/model/scene-placement.ts` | Input normalization and 3D placement defaults                                                            |
| `src/model/hit-tester.ts`                                      | Plan-space selection and picking                                                                         |
| `src/model/plan-service.ts`                                    | Persistent model operations                                                                              |
| `src/model/geometry.ts`, `src/model/object-layers.ts`          | Geometry and element layering                                                                            |
| `src/codecs/`                                                  | YAML/SVG serialization, transform parsing, and number formatting                                         |
| `src/rendering/`                                               | Canvas rendering, render scheduling, pattern painting, texture rotation, and Three.js preview            |
| `src/dom.ts`                                                   | Typed required DOM elements and Canvas context access                                                    |
| `tsconfig.json`                                                | Strict TypeScript checking without emitting files                                                        |
| `src/styles.css`                                               | Editor styles                                                                                            |
| `index.html`                                                   | Page structure, controls, and empty documentation dialogs                                                |
| `docs/user.md`, `docs/developer.md`                            | User and developer documentation in Markdown                                                             |
| `src/ui/components/`                                           | Focused Preact sidebar components and shared form controls                                               |
| `src/ui/`                                                      | UI state, controllers, interaction, document lifecycle, and documentation rendering                      |
| `src/assets/base-model.yaml`                                   | Starter plan imported as text through Vite                                                               |
| `vitest.config.ts`                                             | Vitest regression and built-app projects                                                                 |
| `vite.config.ts`                                               | Preact integration, asset builds, development server, and local build preview                            |
| `scripts/build-portable.mjs`                                   | Bundles source into a self-contained HTML file for direct browser opening.                               |
| `tests/pattern.test.js`                                        | Pattern rotation defaults, edits, and YAML persistence                                                   |
| `tests/model.test.js`                                          | Model validation, persistence, placement math, face visibility, element layering, and light behavior     |
| `tests/ui.test.js`                                             | Bundled startup, control interaction, reactive scene updates, camera fitting, and save round trips       |
| `tests/build.test.js`                                          | Built application startup, documentation, and asset serving through Vite preview                         |
| `tests/portable.test.js`                                       | Isolated portable-file startup, documentation, source editing, and downloads without external resources. |
| `tests/markdown.test.js`                                       | Markdown formatting and HTML sanitization                                                                |

Edit these source files directly. The earlier Python migration/patch scripts are no longer part of the build. Application source is TypeScript with strict checking. The model, codecs, geometry, and 3D/pattern rendering are separate modules; each class has its own TypeScript file, while the editor entry point constructs the classes and connects reactive state. The Documentation button lists the user, developer, and architecture guides; selecting a guide renders its Markdown imported through Vite using Marked and DOMPurify. Mermaid diagrams render as SVG through `src/ui/mermaid-renderer.ts`, which loads Mermaid only when needed and preserves the source if rendering fails. Diagrams work offline in the portable HTML. Use All documentation to return to the list. Edit the files under `docs/` to update their content. Vite handles development and production builds. Regression tests use Vitest and remain JavaScript.

## Test commands

- `npm test` runs the regression project once, without requiring a build.
- `npm run test:watch` reruns regression tests as files change.
- `npm test -- tests/pattern.test.js` runs one regression file.
- `npm test -- -t "validates perimeter inset"` filters by test name.
- `npm run test:build` runs the website and portable smoke tests against an existing `dist/` build.
- `npm run check` verifies formatting, regression tests, typechecking, both builds, and both smoke tests.

`vitest.config.ts` separates the `regression` and `built` projects. Tests run in isolated Node environments; UI and documentation suites create their own jsdom windows and close them after use. Source, documentation, and HTML changes trigger regression reruns even where the suite bundles files with esbuild.

## Architecture and testing

See [docs/architecture.md](docs/architecture.md) for module responsibilities, state ownership, and Mermaid diagrams of data flow, interactions, document loading, and rendering.

`PlanService` owns typed plain plan data and persistent operations. An injected publication callback keeps it independent of editor globals. Preact renders the sidebar, Signals publish state snapshots, and semantic change events support the history descriptions and reset behavior. Canvas handles the 2D view. `ThreePreview` owns the Three.js scene and cached geometry; the floor is on XY and Z is height. Coordinates in plan files use millimeters; Three.js coordinates use meters.

Model tests import the actual TypeScript modules directly through Vitest. UI tests instrument the TypeScript entry point, bundle it with those modules, and run it in jsdom. They use real Three.js geometry, materials, and orbit controls with a mocked WebGL renderer. The build test serves production assets with Vite preview and checks startup and template loading in jsdom. Run it separately with `npm run test:build` after building. The tests verify behavior and geometry but do not validate GPU output; use a real browser to visually review the preview, texture lighting, and pointer interactions.

## Git

The ZIP includes a Git repository on branch `main` with one initial commit and no configured remote. `node_modules` and generated `dist` files are ignored. After extracting, run `git status` to inspect the repository and set a remote when you are ready to host it.

Dependencies are pinned in `package.json` and `package-lock.json`. No application license has been selected; dependency licenses remain with their respective packages and bundled notices.
