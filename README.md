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

| Path                                                  | Purpose                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/editor.ts`                                       | Application lifecycle, Preact controls, Signals state, pointer interaction, and Canvas rendering     |
| `src/model/types.ts`, `src/model/events.ts`           | Plan, geometry, selection, import, and semantic event types                                          |
| `src/model/plan-service.ts`                           | Persistent model operations and 3D placement defaults                                                |
| `src/model/geometry.ts`, `src/model/object-layers.ts` | Geometry, picking, and element layering                                                              |
| `src/codecs/`                                         | YAML/SVG serialization, transform parsing, and number formatting                                     |
| `src/rendering/`                                      | Shared pattern painting, texture rotation, and Three.js preview                                      |
| `src/dom.ts`                                          | Typed required DOM elements and Canvas context access                                                |
| `tsconfig.json`                                       | Strict TypeScript checking without emitting files                                                    |
| `src/styles.css`                                      | Editor styles                                                                                        |
| `index.html`                                          | Page structure, controls, and empty documentation dialogs                                            |
| `docs/user.md`, `docs/developer.md`                   | User and developer documentation in Markdown                                                         |
| `src/ui/`                                             | Documentation dialog wiring and sanitized Markdown rendering                                         |
| `src/assets/base-model.yaml`                          | Starter plan imported as text through Vite                                                           |
| `vite.config.ts`                                      | Preact integration, asset builds, development server, and local build preview                        |
| `tests/pattern.test.cjs`                              | Pattern rotation defaults, edits, and YAML persistence                                               |
| `tests/model.test.cjs`                                | Model validation, persistence, placement math, face visibility, element layering, and light behavior |
| `tests/ui.test.cjs`                                   | Bundled startup, control interaction, reactive scene updates, camera fitting, and save round trips   |
| `tests/build.test.cjs`                                | Built application startup, documentation, and asset serving through Vite preview                     |
| `tests/markdown.test.cjs`                             | Markdown formatting and HTML sanitization                                                            |

Edit these source files directly. The earlier Python migration/patch scripts are no longer part of the build. Application source is TypeScript with strict checking. The model, codecs, geometry, and 3D/pattern rendering are separate modules; the Preact controls, Canvas renderer, and pointer controller currently remain in the editor entry point. Documentation buttons render the Markdown files imported through Vite using Marked and DOMPurify. Edit `docs/user.md` or `docs/developer.md` to update their content. Vite handles development and production builds. Regression test runners remain JavaScript.

## Architecture and testing

`PlanService` owns typed plain plan data and persistent operations. An injected publication callback keeps it independent of editor globals. Preact renders the sidebar, Signals publish state snapshots, and semantic change events support the history descriptions and reset behavior. Canvas handles the 2D view. `ThreePreview` owns the Three.js scene and cached geometry; the floor is on XY and Z is height. Coordinates in plan files use millimeters; Three.js coordinates use meters.

Model tests load the actual TypeScript modules through an in-memory esbuild bundle. UI tests instrument the TypeScript entry point, bundle it with those modules, and run it in jsdom. They use real Three.js geometry, materials, and orbit controls with a mocked WebGL renderer. The build test serves production assets with Vite preview and checks startup and template loading in jsdom. Run it separately with `npm run test:build` after building. The tests verify behavior and geometry but do not validate GPU output; use a real browser to visually review the preview, texture lighting, and pointer interactions.

## Git

The ZIP includes a Git repository on branch `main` with one initial commit and no configured remote. `node_modules` and generated `dist` files are ignored. After extracting, run `git status` to inspect the repository and set a remote when you are ready to host it.

Dependencies are pinned in `package.json` and `package-lock.json`. No application license has been selected; dependency licenses remain with their respective packages and bundled notices.
