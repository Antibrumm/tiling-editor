# Tiling editor

A Preact and Signals application for editing tiling plans in 2D and previewing them as a room in Three.js. This project contains the latest version from our work, including pattern rotation, the T-unwrapped room, layered elements, multiple configurable lights, white exterior faces, and camera-preserving room fitting.

## Start

Requires Node.js 20 or newer and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. Source changes rebuild the preview; refresh your browser to see them. Set `PORT` to change the port. The server binds to your local computer.

## Build and verify

```sh
npm test
npm run build
# Or run both:
npm run check
```

The build produces `dist/index.html`, a self-contained HTML file with bundled JavaScript, CSS, and dependencies. Open it directly in a browser or host it on a static server. A built copy is included in the ZIP, so you can try the editor before installing dependencies. Real 3D rendering requires a browser with WebGL 2.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/editor.js` | Application, Preact controls, Signals state, plan operations, codecs, canvas rendering, and 3D preview |
| `src/styles.css` | Editor styles |
| `index.html` | Page structure, controls, documentation, and starter YAML template |
| `scripts/build.mjs` | Bundles the application and creates the standalone HTML |
| `scripts/dev.mjs` | Local server and source watching |
| `tests/pattern.test.cjs` | Pattern rotation defaults, edits, and YAML persistence |
| `tests/model.test.cjs` | Model validation, persistence, placement math, face visibility, element layering, and light behavior |
| `tests/ui.test.cjs` | Bundled startup, control interaction, reactive scene updates, camera fitting, and save round trips |

Edit these source files directly. The earlier Python migration/patch scripts are no longer part of the build. The application currently stays in one JavaScript module to preserve its existing behavior; splitting its classes into modules can be a subsequent refactor.

## Architecture and testing

`PlanService` owns plain plan data and persistent operations. Preact renders the sidebar, Signals publish state snapshots, and semantic change events support the history descriptions and reset behavior. Canvas handles the 2D view. `ThreePreview` owns the Three.js scene and cached geometry; the floor is on XY and Z is height. Coordinates in plan files use millimeters; Three.js coordinates use meters.

The model tests execute selected classes from the authoritative source in a Node VM. UI tests bundle that same source and run it in jsdom. They use real Three.js geometry, materials, and orbit controls with a mocked WebGL renderer. The tests verify behavior and geometry but do not validate GPU output; use a real browser to visually review the preview, texture lighting, and pointer interactions.

## Git

The ZIP includes a Git repository on branch `main` with one initial commit and no configured remote. `node_modules` and generated `dist` files are ignored. After extracting, run `git status` to inspect the repository and set a remote when you are ready to host it.

Dependencies are pinned in `package.json` and `package-lock.json`. No application license has been selected; dependency licenses remain with their respective packages and bundled notices.
