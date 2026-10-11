## Architecture

The editor is a TypeScript browser application built with Vite. `PlanService` owns the authoritative normalized plan data and emits semantic change events. `EditorState` contains transient UI state. `CanvasViewport`, `CanvasRenderer`, and `HitTester` handle viewport conversion, Canvas 2D rendering, and plan-space picking. `ControlPanelView` renders the sidebar with Preact. Signals expose the effective persistent or transient plan to both preview renderers and YAML. `YamlCodec` and `SvgCodec` are serialization boundaries, while `EditorApp` coordinates document lifecycle and model changes.

Each class has its own TypeScript file. UI controllers and interaction classes live under `src/ui/`; `CanvasRenderer` and `RenderScheduler` live under `src/rendering/`. `PlanService`, `PlanNormalizer`, `ScenePlacement`, `GeometryTools`, and `HitTester` have separate modules under `src/model/`. The editor entry point constructs and connects these classes through typed dependencies. `ControlPanel` renders the Preact components under `src/ui/components/`, passing a typed `ControlPanelDependencies` object to components that need model services, selection, reset actions, or portal targets. Shared form controls remain independent of editor state. `ReorderController` owns the sidebar drag payload, `ConfirmationDialog` handles removal confirmation, and `ActionConsole` plus `ModelChangeLog` manage the action history. Services and utilities use initialized classes with public instance methods. `PlanNormalizer` handles input normalization and is injected into `PlanService`, `YamlCodec`, and `SvgCodec`. The editor initializes its codecs, geometry helpers, placement helper, and UI controllers once per editor. `ThreePreview` owns its placement and layering helpers. Internal codec helpers remain private.

## Class reference

Every class has a JSDoc summary beside its declaration. The following index groups the classes by responsibility.

### Model

| Class and source                                  | Responsibility                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `PlanService` ? `src/model/plan-service.ts`       | Owns the persistent plan and applies model edits through semantic operations.  |
| `PlanNormalizer` ? `src/model/plan-normalizer.ts` | Converts partial plan input into complete model data with consistent defaults. |
| `ScenePlacement` ? `src/model/scene-placement.ts` | Resolves explicit or suggested 3D placements for plan surfaces.                |
| `GeometryTools` ? `src/model/geometry.ts`         | Provides geometry calculations without changing plan data.                     |
| `HitTester` ? `src/model/hit-tester.ts`           | Finds the wall or object under a point in the 2D viewport's world coordinates. |
| `ObjectLayers` ? `src/model/object-layers.ts`     | Calculates extrusion base offsets for overlapping wall objects.                |

### Codecs

| Class and source                          | Responsibility                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `YamlCodec` ? `src/codecs/yaml.ts`        | Encodes and decodes the editor's indentation-sensitive tiling-plan YAML format. |
| `SvgCodec` ? `src/codecs/svg.ts`          | Imports and exports SVG documents using the editor's plan-specific conventions. |
| `Transform2D` ? `src/codecs/transform.ts` | Reads translate and rotate components from SVG transform attributes.            |

### Rendering

| Class and source                                        | Responsibility                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `CanvasRenderer` ? `src/rendering/canvas-renderer.ts`   | Paints a supplied plan into the 2D canvas using injected viewport and UI dependencies.   |
| `RenderScheduler` ? `src/rendering/render-scheduler.ts` | Coalesces repeated render requests into one animation-frame callback.                    |
| `ThreePreview` ? `src/rendering/three-preview.ts`       | Owns the lazily initialized Three.js scene, camera, controls, lights, and surface cache. |

### UI and document lifecycle

| Class and source                                       | Responsibility                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `EditorState` ? `src/ui/editor-state.ts`               | Holds transient selection, view visibility, and an optional drag-preview plan.          |
| `ViewController` ? `src/ui/view-controller.ts`         | Coordinates preview, YAML source, split view, and 3D visibility.                        |
| `SourcePresentation` ? `src/ui/source-presentation.ts` | Renders a syntax-highlighted overlay for the injected YAML textarea.                    |
| `UiFeedback` ? `src/ui/feedback.ts`                    | Displays temporary messages in an injected status element.                              |
| `TitleController` ? `src/ui/title-controller.ts`       | Synchronizes the visible plan title and browser title with PlanService.                 |
| `CanvasViewport` ? `src/ui/canvas-viewport.ts`         | Converts browser client coordinates into the fitted 2D canvas view.                     |
| `Selection` ? `src/ui/selection.ts`                    | Applies semantic wall or object hits to an injected EditorState.                        |
| `PointerController` ? `src/ui/pointer-controller.ts`   | Handles mouse, pen, and touch gestures on the injected preview element.                 |
| `YamlSourceEditor` ? `src/ui/yaml-source-editor.ts`    | Synchronizes the editable YAML source with the effective plan and applies source edits. |
| `EditorApp` ? `src/ui/editor-app.ts`                   | Coordinates document replacement and uploaded YAML or SVG loading.                      |
| `ControlPanel` / `src/ui/control-panel.ts`             | Renders focused sidebar components with injected dependencies.                          |
| `ReorderController` / `src/ui/reorder-controller.ts`   | Owns drag payloads and applies sidebar reordering through PlanService.                  |
| `ConfirmationDialog` / `src/ui/confirmation-dialog.ts` | Opens temporary dialogs and invokes confirmed actions.                                  |
| `ActionConsole` / `src/ui/action-console.ts`           | Displays bounded, timestamped action history.                                           |
| `ModelChangeLog` / `src/ui/model-change-log.ts`        | Formats semantic model changes for the action history.                                  |

Dependency objects in the editor sometimes use getters so controllers can refer to classes and DOM elements constructed later. These getters must remain lazy until initialization finishes. Methods supplied directly to event listeners or animation callbacks are bound to their instance. Shared view boxes and reset snapshots use setters where a controller needs to replace the value.

## Plan data

The runtime model is plain JavaScript data. A plan contains a name, units, patterns, and walls. Walls contain position, rotation, an outline, and optionally objects. Objects are wall-local rectangles. Pattern dimensions are derived from `tileWidth + borderSize` and `tileHeight + borderSize`.

Canvas bounds are derived at runtime from geometry and are not part of the YAML contract. Legacy YAML canvas blocks are accepted and ignored. Empty wall object collections are omitted from YAML.

## Mutation flow

Persistent edits go through `PlanService`. Signals drive rendering and YAML synchronization. Semantic operation events drive the action log and baseline bookkeeping. Drag previews update only the transient plan and commit once on release.

## Canvas interaction

Pointer coordinates are converted through the viewport into plan space. Dragging uses a transient plain-data snapshot and commits the final whole-unit position to `PlanService` on pointer release. Object movement is converted into wall-local coordinates and constrained to the wall polygon. Pan, zoom, fit, and pinch are independent of serialization.

## Rendering

The preview is rendered directly with Canvas 2D. Tile patterns are clipped to wall outlines. Textures replace tile color when present, and optional deterministic quarter-turn rotation is derived from tile-grid coordinates.

## YAML codec

`YamlCodec` is an import/export boundary. YAML is the preferred way of sharing a model.

## SVG codec

`SvgCodec` is an import/export boundary. Export derives its view box from current geometry.

## Controls and selection

The sidebar uses native disclosure sections. Selection coordinates canvas state with the matching wall, object, or light controls. `selectedLightId` is transient and mutually exclusive with surface selection. In 3D, visible source and aim markers carry semantic light IDs and take picking priority over surfaces; hidden markers are excluded. Selecting a light opens its enclosing controls and highlights its markers. Name editing uses temporary text inputs; Enter commits, Escape cancels, and edit-control pointer events are isolated from the surrounding disclosure summary. Reordering is constrained to items at the same structural level.

Lights persist a `type` (`directional` or `conic`) and a full cone `angle` in degrees (1–179, default 60). Plans without these fields retain directional behavior. `PlanService` validates edits and `PlanNormalizer` validates imported types and angles. The codecs preserve both fields. `ThreePreview` uses `SpotLight` and `SpotLightHelper` for conic lights, converts the full angle to a half-angle in radians, and uses no distance falloff to match the existing intensity controls. The visible cone extends to the aim point while illumination has unlimited range. Type changes replace and dispose the prior light, target, markers, and helper; ordinary property edits reuse them.

## Reset behavior

Loading a template or uploaded document establishes the reset baseline. Wall and object snapshots preserve their loaded state. Applying YAML changes the current document without redefining that baseline. Newly added items establish their own initial reset state.

## Document lifecycle

Startup creates an empty document. The integrated **Tiling Bathroom** YAML is loaded only when requested. Upload accepts YAML or SVG. Downloads are generated from the current authoritative plan as YAML, SVG, or rendered PNG.

## Extending the editor

For persistent properties, add normalization in `PlanNormalizer` and mutation support in `PlanService`, then update YAML and SVG serialization only when the property belongs to those interchange contracts. Rendering-only state should stay outside the persisted model. Controls should call model mutations rather than forcing canvas redraws directly.

## Tests

Vitest runs the JavaScript test cases under `tests/`. `vitest.config.ts` defines two projects: `regression` for model, pattern, UI, Markdown, and Mermaid behavior, and `built` for website and portable HTML smoke tests. Use `npm test` for one regression run, `npm run test:watch` for watch mode, and `npm run test:build` after building. `npm run check` runs both projects with a fresh build. Filter a regression file with `npm test -- tests/pattern.test.js`, or a named case with `npm test -- -t "validates perimeter inset"`.

Model tests import TypeScript directly through Vitest. UI tests retain syntax-based editor instrumentation and esbuild bundling, with real Three.js geometry and mocked WebGL rendering. Markdown and Mermaid tests also bundle browser code into jsdom. Register asynchronous work in an awaited `test` callback so assertion failures reach Vitest. Close jsdom windows and servers in hooks or `finally` blocks, and use `vi.stubGlobal` with `vi.unstubAllGlobals` for globals. New tests can use `.test.js` or `.test.ts`. Browser pixel and GPU verification still require the separate Chrome check.
