## Getting started

The editor opens without a plan. Choose **Load template** to load the integrated “Tiling Bathroom” example, or use **Upload plan** to open a YAML or SVG plan. The canvas and controls are generated from the current plan data.

## Preview navigation

Use the preview to inspect and edit the plan visually. Use the + and − controls to zoom and **Fit** to fit the drawing into the available preview. The canvas can be panned, and touch devices support pinch zoom.

## Tile report

Turn on **Report** above the preview to see every wall and its tile regions. The complete-room summary lists each selected tile type with its combined tile-region area and required tile count across all walls. Each wall shows its complete polygon area in square meters. Each tile region shows its visible area in square meters, selected tile name, and required tile count. Region areas include grout and are clipped by the wall outline and inset; later regions replace overlapping areas. Full-wall regions follow outline edits. Every partial tile counts as one, without reusing offcuts. Elements do not subtract tiling.

The report updates when the plan changes. Walls without tile regions are listed too. Turn off **Report** to return to your previous preview or YAML view. Viewing the report does not change the plan or apply YAML drafts. Calculations that exceed the work limit show **Unavailable**.

## Printing the result

Choose **Print result** to open the browser print dialog, where you can print on paper or save as PDF. The document contains the plan title, complete room and wall report, a fitted 2D drawing, and the 3D preview on separate pages. The 2D drawing follows the Labels, Dimensions, and Tile counts display options. The 3D image uses the current camera angle, or the default fitted view if the preview has not been opened. Printing works from the report or YAML view and preserves the plan, camera angle, and unapplied YAML draft. If WebGL is unavailable, the document explains why the 3D image could not be included.

## Selecting and moving walls and elements

Select a wall or an element directly on the canvas. Selected items can be dragged to a new position. Positions are stored in whole millimeters. Elements are constrained to their wall outline while dragging.

## Drawing controls

The sidebar contains the editable tile patterns, walls, and wall elements. Expand a section to edit its values. Use the pencil beside a name to rename it. Walls and elements can be added, removed, reset, and reordered within their own level using the drag handle.

**Labels** and **Dimensions** under Display options control the annotations shown on the canvas.

**Tile counts** shows a tile count for each pattern used on each wall or floor in the 2D view. Combined wall totals are omitted. Every full or partial tile counts as one; offcuts are never reused. Counts include only the visible pattern regions, clipped by the wall polygon and inset, and follow each region's grout, pattern offsets and rotation. All tiling comes from pattern regions; walls without pattern regions have no tile count annotations. Overlapping regions replace the pattern below them. Elements overlay the tiling and do not subtract tiles. Counts update when the plan changes and are independent of zoom. Very large tile layouts show an unavailable message instead of blocking the editor. These counts do not include extra tiles for breakage or spare stock.

Each wall?s Outline section has a **Pattern inset (mm)** setting. Set it to `5` to leave a 5 mm untiled band inside every polygon edge, including sloped edges and concave corners. The band shows the outline fill color and follows the polygon with sharp corners. Pattern X/Y offsets are relative to the inset: with a 5 mm inset, region offsets of `0, 0` start the grid at `5, 5` in wall-local coordinates, before pattern rotation. This also applies to pattern regions. The inset limits all pattern regions in 2D, PNG exports, and 3D. `0` tiles to the edge; older plans default to `0`. YAML and SVG preserve the setting. An inset wider than the available surface leaves that area untiled.

Use **Add full-wall pattern** for a region that covers the entire wall polygon and follows outline edits. The **Full wall (follows outline)** checkbox switches between full-wall coverage and a rectangle with X/Y/width/height controls. Each region owns its pattern, offsets, and rotation. Regions paint in order, with later regions above earlier ones. Older YAML and SVG outline patterns are automatically migrated into a full-wall region below existing regions; saving writes only region tiling.

## Tile patterns

Tile patterns define tile width, tile height, border size, tile color, border color, and pattern placement. A texture image can replace the tile color. When a texture is present, **Random texture rotation** can rotate individual tiles by deterministic 90° steps while keeping the layout stable between redraws.

## 3D preview

Turn on **3D preview** to see the surfaces in space. Drag to orbit, Shift-drag or right-drag to pan, and scroll or pinch to zoom. Fit room and the camera presets help you inspect the scene. Click a wall, floor, or element to select its sidebar controls.

Open **3D placement** inside each wall section to choose a vertical wall or horizontal floor, then set its X/Y ground position, Z elevation, and angle around Z. The floor lies on the XY plane. These positions are separate from the unfolded 2D drawing. Older plans receive suggested positions; verify and edit them to assemble your actual room. Elements start as simple boxes: their **3D depth / floor height** sets the projection from a wall or height above a floor.

The 3D materials use the same pattern offsets, rotation, grout, textures, and pattern regions as the 2D view. YAML preserves all 3D placement and depth values. PNG export continues to export the 2D drawing.

**3D light placement** lets you add directional or conic lights and edit each light’s color, intensity, and Position and Aim coordinates in millimeters. Use **Light type** to switch between them. Conic lights also have a **Cone angle** slider: the full opening angle in degrees, from 1° to 179°, initially 60°. Their illumination is limited to that cone, without distance falloff. Default and newly added lights aim at the floor’s center in world coordinates. Set intensity to 0 to turn off a light.

Click a light’s card header to select it. With **Light sources** enabled in the 3D toolbar, you can also click its gold source marker or turquoise aim marker. Selection highlights the markers in green and opens the matching controls. Use the × in the card header to remove a light after confirmation. The helpers show the light’s direction and, for conic lights, the cone opening. Hiding helpers does not change illumination. Fit room frames the room while preserving the current viewing angle. The Perspective, Top, and Front buttons select a new viewing angle. Light types, cone angles, and other settings are saved with the plan; the soft hemisphere lighting stays active.

## YAML source

Turn on **YAML source** to edit the plan as YAML, then choose **Apply YAML** to apply the changes. **Side by side** shows the preview and source together. YAML source mode and side-by-side mode are mutually exclusive toggles.

The YAML stores the plan name, patterns, walls, outlines, and elements. Canvas bounds are derived automatically from the plan geometry and therefore are not stored as a `canvas` block. Walls without elements omit the `objects` property.

## Import and export

- **Upload plan** imports YAML or SVG.
- **Download YAML** saves the editable plan data.
- **Download SVG** exports the drawing as vector artwork.
- **Download PNG** exports the current rendered canvas as an image.
- **Copy source** copies the current YAML source to the clipboard.

## Reset and action log

**Reset all** restores the plan to its established reset point. Individual wall and element reset controls restore those items to their corresponding baseline. The Action log below the editor records semantic editing actions and can be cleared without changing the plan.

## Plan coordinates

Editor dimensions and positions are expressed in millimeters. Canvas bounds are recalculated from the current geometry, so moving or changing the plan does not require manually maintaining viewport dimensions in YAML.
