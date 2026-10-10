import type { PlanChange } from './events';
import type { Plan, PlanInput, Input, CanvasBounds, Pattern, PatternInput, Point, Position, PatternRegion, PlanObject, Placement, Wall, WallInput, Light } from './types';

function isKey<T extends string>(key: string, keys: readonly T[]): key is T { return keys.includes(key as T); }

export class PlanService {
  data: Plan;
  listeners = new Set<(change: PlanChange) => void>();
  constructor(data: PlanInput = {}, private publish: () => void = () => {}) {
    this.data = PlanService.normalizeData(data);
  }
  static finite(value: unknown, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  static normalizeCanvas(canvas: Input<CanvasBounds> = {}): CanvasBounds {
    return {
      x: PlanService.finite(canvas.x),
      y: PlanService.finite(canvas.y),
      width: PlanService.finite(canvas.width),
      height: PlanService.finite(canvas.height),
      flipY: PlanService.finite(canvas.flipY, PlanService.finite(canvas.y) + PlanService.finite(canvas.height))
    };
  }
  static normalizePattern(pattern: PatternInput = {}): Pattern {
    return {
      name: String(pattern.name ?? ''),
      tileWidth: PlanService.finite(pattern.tileWidth),
      tileHeight: PlanService.finite(pattern.tileHeight),
      borderSize: Math.max(0, PlanService.finite(pattern.borderSize, Math.max(0, PlanService.finite(pattern.patternWidth) - PlanService.finite(pattern.tileWidth)))),
      tileColor: String(pattern.tileColor ?? pattern.fill ?? '#ffffff'),
      borderColor: String(pattern.borderColor ?? pattern.stroke ?? '#888888'),
      tileTexture: String(pattern.tileTexture ?? ''),
      randomTextureRotation: pattern.randomTextureRotation === true || String(pattern.randomTextureRotation).toLowerCase() === 'true'
    };
  }
  static normalizePoint(point: Point | Position): Point {
    if (Array.isArray(point)) return [PlanService.finite(point[0]), PlanService.finite(point[1])];
    return [PlanService.finite(point?.x), PlanService.finite(point?.y)];
  }
  static normalizePatternRegion(region: Input<PatternRegion> = {}): PatternRegion {
    return {
      x: PlanService.finite(region.x),
      y: PlanService.finite(region.y),
      width: Math.max(0, PlanService.finite(region.width)),
      height: Math.max(0, PlanService.finite(region.height)),
      pattern: String(region.pattern ?? ''),
      patternX: PlanService.finite(region.patternX),
      patternY: PlanService.finite(region.patternY),
      patternRotation: PlanService.finite(region.patternRotation)
    };
  }
  static normalizeObject(object: Input<PlanObject> = {}): PlanObject {
    return {
      name: String(object.name ?? ''),
      x: PlanService.finite(object.x),
      y: PlanService.finite(object.y),
      width: PlanService.finite(object.width),
      height: PlanService.finite(object.height),
      fill: String(object.fill ?? ''),
      depth: Math.max(1,PlanService.finite(object.depth,10))
    };
  }
  static floorAim(plan: Pick<Plan, "walls">) {
    const floor=ScenePlacement.floor(plan),points=floor?.outline.points;
    if(!floor || !points?.length)return {aimX:0,aimY:0,aimZ:0};
    let area=0,x=0,y=0;
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length],cross=a[0]*b[1]-b[0]*a[1];
      area+=cross;x+=(a[0]+b[0])*cross;y+=(a[1]+b[1])*cross;
    }
    if(Math.abs(area)>1e-9){x/=3*area;y/=3*area;}
    else {const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);x=(Math.min(...xs)+Math.max(...xs))/2;y=(Math.min(...ys)+Math.max(...ys))/2;}
    const placement=ScenePlacement.effective(plan,floor,plan.walls.indexOf(floor)),angle=placement.yaw*Math.PI/180;
    const round=(value: number)=>Math.round(value*10000)/10000;
    return {aimX:round(placement.x+x*Math.cos(angle)-y*Math.sin(angle)),aimY:round(placement.y+x*Math.sin(angle)+y*Math.cos(angle)),aimZ:round(placement.z)};
  }
  static normalizeLights(data: PlanInput,plan: Pick<Plan, "walls">): Light[] {
    const values=Array.isArray(data.lights3d)?data.lights3d:[data.light3d||{}];
    const used=new Set(),aim=PlanService.floorAim(plan);
    return values.map((value,index)=>{
      if(!value||typeof value!=='object')value={};
      let id=String(value.id||'light-'+(index+1)),base=id,suffix=2;
      while(used.has(id))id=base+'-'+suffix++;
      used.add(id);
      return {id,x:PlanService.finite(value.x,5000),y:PlanService.finite(value.y,-6000),z:PlanService.finite(value.z,9000),
        aimX:PlanService.finite(value.aimX,aim.aimX),aimY:PlanService.finite(value.aimY,aim.aimY),aimZ:PlanService.finite(value.aimZ,aim.aimZ),
        color:typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color)?value.color:'#ffffff',intensity:Math.max(0,PlanService.finite(value.intensity,2.5))};
    });
  }
  setLightValue(id: string, key: string, value: unknown) {
    if (!isKey(key, ['x','y','z','aimX','aimY','aimZ','color','intensity'] as const)) return false;
    const light=this.data.lights3d.find(light=>light.id===id);
    if (!light) return false;
    if (key === 'color') { const next=String(value); if (!/^#[0-9a-f]{6}$/i.test(next)) return false; light.color=next; }
    else { const next=Number(value); if (!Number.isFinite(next) || (key==='intensity' && next<0)) return false; light[key]=next; }
    this.emit({type:'light-change',lightId:id,key,value:light[key]}); return true;
  }
  addLight() {
    let index=1;while(this.data.lights3d.some(light=>light.id==='light-'+index))index++;
    const previous=this.data.lights3d.at(-1),aim=PlanService.floorAim(this.data);
    const light={id:'light-'+index,x:previous?previous.x+1000:5000,y:previous?.y??-6000,z:previous?.z??9000,
      ...aim,color:previous?.color??'#ffffff',intensity:previous?.intensity??2.5};
    this.data.lights3d.push(light);this.emit({type:'light-add',lightId:light.id});return light.id;
  }
  removeLight(id: string) {
    const index=this.data.lights3d.findIndex(light=>light.id===id);if(index<0)return false;
    this.data.lights3d.splice(index,1);this.emit({type:'light-remove',lightId:id});return true;
  }
  static normalizePlacement(value: Input<Placement> | null | undefined): Placement | null {
    if (!value || typeof value !== 'object') return null;
    return { type:value.type==='floor'?'floor':'wall', x:PlanService.finite(value.x), y:PlanService.finite(value.y), z:PlanService.finite(value.z), yaw:PlanService.finite(value.yaw) };
  }
  static normalizeWall(wall: WallInput = {}): Wall {
    const outline = wall.outline ?? {};
    return {
      name: String(wall.name ?? ''),
      x: PlanService.finite(wall.x),
      y: PlanService.finite(wall.y),
      rotation: PlanService.finite(wall.rotation),
      placement3d: PlanService.normalizePlacement(wall.placement3d),
      outline: {
        points: Array.isArray(outline.points) ? outline.points.map(PlanService.normalizePoint) : [],
        pattern: String(outline.pattern ?? ''),
        patternX: PlanService.finite(outline.patternX),
        patternY: PlanService.finite(outline.patternY),
        patternRotation: PlanService.finite(outline.patternRotation),
        fill: String(outline.fill ?? 'white'),
        stroke: String(outline.stroke ?? ''),
        strokeWidth: PlanService.finite(outline.strokeWidth, 1)
      },
      patternRegions: Array.isArray(wall.patternRegions) ? wall.patternRegions.map(PlanService.normalizePatternRegion) : [],
      objects: Array.isArray(wall.objects) ? wall.objects.map(PlanService.normalizeObject) : []
    };
  }
  static canvasFromWalls(walls: Wall[] = []): CanvasBounds {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    const include=(x: number,y: number)=>{if(!Number.isFinite(x)||!Number.isFinite(y))return;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);};
    for(const wall of walls){
      const angle=PlanService.finite(wall.rotation)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
      const includeLocal=(x: number,y: number)=>include(wall.x+x*cos-y*sin,wall.y+x*sin+y*cos);
      for(const point of wall.outline?.points||[]) includeLocal(point[0],point[1]);
      for(const object of wall.objects||[]) for(const [x,y] of [[object.x,object.y],[object.x+object.width,object.y],[object.x+object.width,object.y+object.height],[object.x,object.y+object.height]]) includeLocal(x,y);
    }
    if(![minX,minY,maxX,maxY].every(Number.isFinite)) return {x:0,y:0,width:0,height:0,flipY:0};
    return {x:minX,y:0,width:Math.max(0,maxX-minX),height:Math.max(0,maxY-minY),flipY:maxY};
  }
  static normalizeData(data: PlanInput = {}): Plan {
    const walls=Array.isArray(data.walls) ? data.walls.map(PlanService.normalizeWall) : [];
    if(data.upAxis3d!=='z') for(const wall of walls) if(wall.placement3d) { const p=wall.placement3d; wall.placement3d={...p,y:p.z,z:p.y,yaw:-p.yaw}; }
    return {
      upAxis3d: 'z',
      lights3d: PlanService.normalizeLights(data,{walls}),
      name: String(data.name ?? 'Tiling plan').trim() || 'Tiling plan',
      units: String(data.units ?? 'mm').trim() || 'mm',
      canvas: PlanService.canvasFromWalls(walls),
      patterns: Array.isArray(data.patterns) ? data.patterns.map(PlanService.normalizePattern) : [],
      walls
    };
  }
  static wallIn(plan: Plan | null, name: string) { return plan?.walls?.find(wall => wall.name === name) || null; }
  onEvent(listener: (change: PlanChange) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(change: PlanChange = { type: 'change' }) {
    this.data.canvas = PlanService.canvasFromWalls(this.data.walls);
    this.publish();
    for (const listener of [...this.listeners]) {
      try { listener(change); }
      catch (error) { console.error('PlanService change listener failed:', error); }
    }
  }
  get name() { return this.data?.name || 'Tiling plan'; }
  setName(name: string) { const oldName=this.data.name; this.data.name = String(name ?? '').trim() || 'Tiling plan'; this.emit({ type: 'name-change', oldName, name: this.data.name }); }
  replaceData(data: PlanInput, change: PlanChange = { type: 'replace' }, emit = true) {
    this.data = PlanService.normalizeData(data);
    if (emit) this.emit(change);
  }
  snapshot() { return structuredClone(this.data); }
  wall(name: string) { return PlanService.wallIn(this.data, name); }
  moveWall(wallName: string, x: number, y: number) {
    const wall=this.wall(wallName); if(!wall) return false;
    wall.x=Math.round(Number(x)||0); wall.y=Math.round(Number(y)||0);
    this.emit({type:'wall-move',wallName,x:wall.x,y:wall.y}); return true;
  }
  moveObject(wallName: string, objectIndex: number, x: number, y: number, objectName: string='') {
    const wall=this.wall(wallName); if(!wall) return false;
    const object=Number.isInteger(objectIndex)?wall.objects[objectIndex]:wall.objects.find(o=>o.name===objectName);
    if(!object) return false;
    object.x=Math.round(Number(x)||0); object.y=Math.round(Number(y)||0);
    this.emit({type:'object-move',wallName,objectIndex,objectName:object.name,x:object.x,y:object.y}); return true;
  }
  setPlacement3d(wallName: string,key: string,value: unknown) {
    if (!isKey(key, ['type','x','y','z','yaw'] as const)) return false;
    const wall=this.wall(wallName); if(!wall)return false;
    const placement=wall.placement3d || ScenePlacement.suggest(this.data,wall,this.data.walls.indexOf(wall));
    if(key==='type'){ if(value !== 'floor' && value !== 'wall')return false; wall.placement3d={...placement,type:value}; }
    else {const next=Number(value);if(!Number.isFinite(next))return false; wall.placement3d={...placement,[key]:next};}
    this.emit({type:'surface-placement',wallName,key,value}); return true;
  }
  setWallValue(wallName: string, key: string, value: unknown) {
    if (!isKey(key, ['x','y','rotation'] as const)) return false;
    const w=this.wall(wallName); if(!w)return false;
    const oldValue=w[key]; const next=Number(value); if(!Number.isFinite(next)) return false;
    w[key]=next; this.emit({type:'wall-change',wallName,key,oldValue,value:w[key]}); return true;
  }
  setObjectValue(wallName: string,index: number,key: string,value: unknown) {
    if (!isKey(key, ['name','x','y','width','height','fill','depth'] as const)) return false;
    const o=this.wall(wallName)?.objects[index]; if(!o)return false;
    const objectName=o.name; const oldValue=o[key];
    if (key==='name' || key==='fill') o[key]=String(value);
    else { const next=Number(value); if(!Number.isFinite(next)) return false; o[key]=key==='depth'?Math.max(1,next):next; }
    this.emit({type:'object-change',wallName,index,objectName,key,oldValue,value:o[key]}); return true;
  }
  setOutlineValue(wallName: string,key: string,value: unknown) {
    if (!isKey(key, ['pattern','patternRotation','fill','stroke','strokeWidth'] as const)) return false;
    const o=this.wall(wallName)?.outline; if(!o)return false; const oldValue=o[key];
    if (key==='strokeWidth'||key==='patternRotation') { const next=Number(value); if(!Number.isFinite(next)) return false; o[key]=next; }
    else o[key]=String(value ?? '');
    this.emit({type:'outline-change',wallName,key,oldValue,value:o[key]}); return true;
  }
  setOutlinePoints(wallName: string, points: Point[]) {
    const o=this.wall(wallName)?.outline; if(!o || !Array.isArray(points)) return false;
    const normalized=points.map(PlanService.normalizePoint).filter(p=>p.every(Number.isFinite));
    if(normalized.length < 3) return false;
    const oldValue=o.points.map(p=>[...p]); o.points=normalized;
    this.emit({type:'outline-change',wallName,key:'points',oldValue,value:o.points.map(p=>[...p])}); return true;
  }
  setPatternValue(patternName: string,key: string,value: unknown) {
    if (!isKey(key, ['tileWidth','tileHeight','borderSize','tileColor','borderColor','tileTexture','randomTextureRotation'] as const)) return false;
    const p=this.data.patterns.find(p=>p.name===patternName); if(!p)return false; const oldValue=p[key];
    if (key==='tileColor' || key==='borderColor' || key==='tileTexture') p[key]=String(value ?? '');
    else if (key==='randomTextureRotation') p[key]=Boolean(value);
    else { const next=Number(value); if(!Number.isFinite(next)) return false; p[key]=next; }
    this.emit({type:'pattern-change',patternName,key,oldValue,value:p[key]}); return true;
  }
  setPatternTranslation(wallName: string,x: number,y: number) { const o=this.wall(wallName)?.outline; if(!o)return false; o.patternX=Math.round(Number(x)||0); o.patternY=Math.round(Number(y)||0); this.emit({type:'pattern-move',wallName,x:o.patternX,y:o.patternY}); return true; }
  addPatternRegion(wallName: string, region: Input<PatternRegion> = {}) { const w=this.wall(wallName); if(!w)return false; const added=PlanService.normalizePatternRegion(region); w.patternRegions.push(added); this.emit({type:'pattern-region-add',wallName,index:w.patternRegions.length-1,region:structuredClone(added)}); return true; }
  setPatternRegion(wallName: string,index: number,key: string,value: unknown) { const w=this.wall(wallName),r=w?.patternRegions?.[index]; if(!r||!isKey(key, ['x','y','width','height','pattern','patternX','patternY','patternRotation'] as const))return false; const oldValue=r[key]; if(key==='pattern')r[key]=String(value??''); else { const next=Number(value); if(!Number.isFinite(next))return false; r[key]=(key==='width'||key==='height')?Math.max(0,next):next; } this.emit({type:'pattern-region-change',wallName,index,key,oldValue,value:r[key]}); return true; }
  removePatternRegion(wallName: string,index: number) { const w=this.wall(wallName); if(!w||!w.patternRegions?.[index])return false; const [region]=w.patternRegions.splice(index,1); this.emit({type:'pattern-region-remove',wallName,index,region}); return true; }
  renameWall(oldName: string,newName: string) { const w=this.wall(oldName); const n=String(newName||'').trim(); if(!w||!n||this.wall(n))return false; w.name=n; this.emit({type:'wall-rename',wallName:n,oldName,newName:n}); return true; }
  addWall(wall: WallInput) { const added=PlanService.normalizeWall(wall); this.data.walls.push(added); this.emit({type:'wall-add',wallName:added.name}); return true; }
  removeWall(name: string) { const i=this.data.walls.findIndex(w=>w.name===name); if(i<0)return false; const removed=this.data.walls[i]; this.data.walls.splice(i,1); this.emit({type:'wall-remove',wallName:removed.name}); return true; }
  resetWall(name: string, baseline: Wall) {
    const i=this.data.walls.findIndex(w=>w.name===name); if(i<0||!baseline)return false;
    const restored=PlanService.normalizeWall(baseline);
    if(restored.name!==name && this.data.walls.some((w,index)=>index!==i&&w.name===restored.name)) return false;
    const oldName=this.data.walls[i].name;
    this.data.walls[i]=restored;
    this.emit({type:'wall-reset',wallName:restored.name,oldName});
    return true;
  }
  addObject(wallName: string,object: Input<PlanObject>) { const w=this.wall(wallName); if(!w)return false; const added=PlanService.normalizeObject(object); w.objects.push(added); this.emit({type:'object-add',wallName,index:w.objects.length-1,objectName:added.name}); return true; }
  removeObject(wallName: string,index: number) { const w=this.wall(wallName); if(!w||!w.objects[index])return false; const removed=w.objects[index]; w.objects.splice(index,1); this.emit({type:'object-remove',wallName,index,objectName:removed.name}); return true; }
  resetObject(wallName: string,index: number,baseline: PlanObject) {
    const w=this.wall(wallName); if(!w||!w.objects[index]||!baseline)return false;
    const restored=PlanService.normalizeObject(baseline);
    w.objects[index]=restored;
    this.emit({type:'object-reset',wallName,index,objectName:restored.name});
    return true;
  }
  addPattern(pattern: PatternInput) { const p=PlanService.normalizePattern(pattern); if(!p.name||this.data.patterns.some(x=>x.name===p.name))return false; this.data.patterns.push(p); this.emit({type:'pattern-add',patternName:p.name}); return true; }
  duplicatePattern(name: string) { const source=this.data.patterns.find(p=>p.name===name); if(!source)return false; let i=1,copyName=name+'-copy'; while(this.data.patterns.some(p=>p.name===copyName))copyName=name+'-copy-'+(++i); const copy={...structuredClone(source),name:copyName}; this.data.patterns.splice(this.data.patterns.indexOf(source)+1,0,copy); this.emit({type:'pattern-duplicate',patternName:name,newName:copyName}); return true; }
  removePattern(name: string) { if(this.data.walls.some(w=>w.outline.pattern===name||w.patternRegions?.some(r=>r.pattern===name)))return false; const i=this.data.patterns.findIndex(p=>p.name===name); if(i<0)return false; this.data.patterns.splice(i,1); this.emit({type:'pattern-remove',patternName:name}); return true; }
  renamePattern(oldName: string,newName: string) { const p=this.data.patterns.find(p=>p.name===oldName); const n=String(newName||'').trim(); if(!p||!n||this.data.patterns.some(x=>x.name===n))return false; p.name=n; for(const w of this.data.walls){if(w.outline.pattern===oldName)w.outline.pattern=n;for(const r of w.patternRegions||[])if(r.pattern===oldName)r.pattern=n;} this.emit({type:'pattern-rename',oldName,newName:n}); return true; }
  reorderPattern(fromIndex: number,toIndex: number) { const a=this.data.patterns;if(!Number.isInteger(fromIndex)||!Number.isInteger(toIndex)||fromIndex<0||fromIndex>=a.length||toIndex<0||toIndex>=a.length||fromIndex===toIndex)return false;const [item]=a.splice(fromIndex,1);a.splice(toIndex,0,item);this.emit({type:'pattern-reorder',patternName:item.name,fromIndex,toIndex});return true; }
  reorderWall(fromIndex: number,toIndex: number) { const a=this.data.walls;if(!Number.isInteger(fromIndex)||!Number.isInteger(toIndex)||fromIndex<0||fromIndex>=a.length||toIndex<0||toIndex>=a.length||fromIndex===toIndex)return false;const [item]=a.splice(fromIndex,1);a.splice(toIndex,0,item);this.emit({type:'wall-reorder',wallName:item.name,fromIndex,toIndex});return true; }
  reorderObject(wallName: string,fromIndex: number,toIndex: number) { const a=this.wall(wallName)?.objects;if(!a||!Number.isInteger(fromIndex)||!Number.isInteger(toIndex)||fromIndex<0||fromIndex>=a.length||toIndex<0||toIndex>=a.length||fromIndex===toIndex)return false;const [item]=a.splice(fromIndex,1);a.splice(toIndex,0,item);this.emit({type:'object-reorder',wallName,objectName:item.name,fromIndex,toIndex});return true; }
}
export class ScenePlacement {
  static floor(plan: Pick<Plan, "walls">) {return plan.walls.find(w=>w.placement3d?.type==='floor') || plan.walls.find(w=>/^(floor|ground|boden)$/i.test(w.name));}
  static suggest(plan: Pick<Plan, "walls">,wall: Wall,index: number): Placement {
    const floor=ScenePlacement.floor(plan);
    const points=floor?.outline.points || [[0,0],[3000,3000]];
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const name=wall.name.toLowerCase();
    if(wall===floor)return {type:'floor',x:0,y:0,z:0,yaw:0};
    if(name==='back')return {type:'wall',x:minX,y:maxY,z:0,yaw:0};
    if(name==='left')return {type:'wall',x:minX,y:minY,z:0,yaw:90};
    if(name==='right')return {type:'wall',x:maxX,y:maxY,z:0,yaw:-90};
    if(name==='front')return {type:'wall',x:maxX,y:minY,z:0,yaw:180};
    // Unnamed surfaces remain separate until the user assigns their placement.
    return {type:'wall',x:maxX+1000+(index*800),y:minY,z:0,yaw:0};
  }
  static effective(plan: Pick<Plan, "walls">,wall: Wall,index: number): Placement {return wall.placement3d || ScenePlacement.suggest(plan,wall,index);}
}

