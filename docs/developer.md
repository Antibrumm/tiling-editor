## Architecture

The editor is a TypeScript browser application built with Vite. `PlanService` owns the authoritative normalized plan data and emits semantic change events. `EditorState` contains transient UI state. `CanvasViewport`, `CanvasRenderer`, and `HitTester` handle viewport conversion, Canvas 2D rendering, and plan-space picking. `ControlPanelView` renders the sidebar with Preact. Signals expose the effective persistent or transient plan to both preview renderers and YAML. `YamlCodec` and `SvgCodec` are serialization boundaries, while `EditorApp` coordinates document lifecycle and model changes.

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

The sidebar uses native disclosure sections. Selection coordinates canvas state with the matching wall or object controls. Name editing uses temporary text inputs; Enter commits, Escape cancels, and edit-control pointer events are isolated from the surrounding disclosure summary. Reordering is constrained to items at the same structural level.

## Reset behavior

Loading a template or uploaded document establishes the reset baseline. Wall and object snapshots preserve their loaded state. Applying YAML changes the current document without redefining that baseline. Newly added items establish their own initial reset state.

## Document lifecycle

Startup creates an empty document. The integrated **Tiling Bathroom** YAML is loaded only when requested. Upload accepts YAML or SVG. Downloads are generated from the current authoritative plan as YAML, SVG, or rendered PNG.

## Extending the editor

For persistent properties, add normalization and mutation support in `PlanService`, then update YAML and SVG serialization only when the property belongs to those interchange contracts. Rendering-only state should stay outside the persisted model. Controls should call model mutations rather than forcing canvas redraws directly.
