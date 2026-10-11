## Getting started

The editor opens without a plan. Choose **Load template** to load the integrated “Tiling Bathroom” example, or use **Upload plan** to open a YAML or SVG plan. The canvas and controls are generated from the current plan data.

## Preview navigation

Use the preview to inspect and edit the plan visually. Use the + and − controls to zoom and **Fit** to fit the drawing into the available preview. The canvas can be panned, and touch devices support pinch zoom.

## Selecting and moving walls and elements

Select a wall or an element directly on the canvas. Selected items can be dragged to a new position. Positions are stored in whole millimeters. Elements are constrained to their wall outline while dragging.

## Drawing controls

The sidebar contains the editable tile patterns, walls, and wall elements. Expand a section to edit its values. Use the pencil beside a name to rename it. Walls and elements can be added, removed, reset, and reordered within their own level using the drag handle.

**Labels** and **Dimensions** under Display options control the annotations shown on the canvas.

**Tile counts** shows the number of tiles needed on each wall or floor in the 2D view, with a breakdown by pattern when several patterns are used. Every full or partial tile counts as one; offcuts are never reused. Counts follow the polygon, inset, grout, pattern offsets and rotation, and visible pattern regions. Overlapping regions replace the pattern below them. Elements overlay the tiling and do not subtract tiles. Counts update when the plan changes and are independent of zoom. Very large tile layouts show an unavailable message instead of blocking the editor. These counts do not include extra tiles for breakage or spare stock.

Each wall has a **Pattern inset (mm)** setting. Set it to `5` to leave a 5 mm untiled band inside every polygon edge, including sloped edges and concave corners. The band shows the outline fill color and follows the polygon with sharp corners. Pattern X/Y offsets are relative to the inset: with a 5 mm inset, offsets of `0, 0` start the grid at `5, 5` in wall-local coordinates, before pattern rotation. This also applies to pattern regions. The inset limits both the main pattern and pattern regions in 2D, PNG exports, and 3D. `0` tiles to the edge; older plans default to `0`. YAML and SVG preserve the setting. An inset wider than the available surface leaves that area untiled.

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
