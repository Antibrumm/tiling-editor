export type Point = [number, number];
export interface Position { x: number; y: number }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export interface CanvasBounds { x: number; y: number; width: number; height: number; flipY: number }
export interface Pattern { name: string; tileWidth: number; tileHeight: number; borderSize: number; tileColor: string; borderColor: string; tileTexture: string; randomTextureRotation: boolean }
export interface PatternRegion { x: number; y: number; width: number; height: number; pattern: string; patternX: number; patternY: number; patternRotation: number }
export interface PlanObject { name: string; x: number; y: number; width: number; height: number; fill: string; depth: number }
export interface Placement { type: 'wall' | 'floor'; x: number; y: number; z: number; yaw: number }
export interface Outline { points: Point[]; pattern: string; patternX: number; patternY: number; patternRotation: number; fill: string; stroke: string; strokeWidth: number }
export interface Wall { name: string; x: number; y: number; rotation: number; placement3d: Placement | null; outline: Outline; patternRegions: PatternRegion[]; objects: PlanObject[] }
export interface Light { id: string; x: number; y: number; z: number; aimX: number; aimY: number; aimZ: number; color: string; intensity: number }
export interface Plan { upAxis3d: 'z'; name: string; units: string; canvas: CanvasBounds; patterns: Pattern[]; walls: Wall[]; lights3d: Light[] }
// Import values may need coercion; normalized runtime data uses the types above.
export type Input<T> = { [K in keyof T]?: T[K] extends number ? number | string | null : T[K] extends boolean ? boolean | string : T[K] };
export type PatternInput = Input<Pattern> & { patternWidth?: number | string; fill?: string; stroke?: string };
export type OutlineInput = Omit<Input<Outline>, 'points'> & { points?: (Point | Position)[] };
export type WallInput = Omit<Input<Wall>, 'outline' | 'objects' | 'patternRegions' | 'placement3d'> & { outline?: OutlineInput; objects?: Input<PlanObject>[]; patternRegions?: Input<PatternRegion>[]; placement3d?: Input<Placement> | null };
export interface PlanInput { upAxis3d?: string; name?: string; units?: string; canvas?: Input<CanvasBounds>; patterns?: PatternInput[]; walls?: WallInput[]; lights3d?: Input<Light>[]; light3d?: Input<Light> }
export type SelectionHit = { type: 'wall'; wallId: string; objectName?: never; objectIndex?: never } | { type: 'object'; wallId: string; objectName: string; objectIndex: number };
