import './styles.css';

    import { h, render, Fragment } from 'preact';
    import { useEffect, useRef, useState } from 'preact/hooks';
    import { createPortal } from 'preact/compat';
    import { signal, computed, effect, batch } from '@preact/signals';

    function init() {
      'use strict';
      class EditorState {
        constructor() {
          this.selectedWallId = null;
          this.selectedObjectName = null;
          this.selectedObjectIndex = null;
          this.sourceVisible = false;
          this.splitView = false;
          this.interactionPlan = null;
        }
      }
      class PlanService {
        constructor(data = {}) {
          this.data = PlanService.normalizeData(data);
          this.listeners = new Set();
        }
        static finite(value, fallback = 0) {
          const number = Number(value);
          return Number.isFinite(number) ? number : fallback;
        }
        static normalizeCanvas(canvas = {}) {
          return {
            x: PlanService.finite(canvas.x),
            y: PlanService.finite(canvas.y),
            width: PlanService.finite(canvas.width),
            height: PlanService.finite(canvas.height),
            flipY: PlanService.finite(canvas.flipY, PlanService.finite(canvas.y) + PlanService.finite(canvas.height))
          };
        }
        static normalizePattern(pattern = {}) {
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
        static normalizePoint(point) {
          if (Array.isArray(point)) return [PlanService.finite(point[0]), PlanService.finite(point[1])];
          return [PlanService.finite(point?.x), PlanService.finite(point?.y)];
        }
        static normalizePatternRegion(region = {}) {
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
        static normalizeObject(object = {}) {
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
        static floorAim(plan) {
          const floor=ScenePlacement.floor(plan),points=floor?.outline.points;
          if(!points?.length)return {aimX:0,aimY:0,aimZ:0};
          let area=0,x=0,y=0;
          for(let i=0;i<points.length;i++) {
            const a=points[i],b=points[(i+1)%points.length],cross=a[0]*b[1]-b[0]*a[1];
            area+=cross;x+=(a[0]+b[0])*cross;y+=(a[1]+b[1])*cross;
          }
          if(Math.abs(area)>1e-9){x/=3*area;y/=3*area;}
          else {const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);x=(Math.min(...xs)+Math.max(...xs))/2;y=(Math.min(...ys)+Math.max(...ys))/2;}
          const placement=ScenePlacement.effective(plan,floor,plan.walls.indexOf(floor)),angle=placement.yaw*Math.PI/180;
          const round=value=>Math.round(value*10000)/10000;
          return {aimX:round(placement.x+x*Math.cos(angle)-y*Math.sin(angle)),aimY:round(placement.y+x*Math.sin(angle)+y*Math.cos(angle)),aimZ:round(placement.z)};
        }
        static normalizeLights(data,plan) {
          const values=Array.isArray(data.lights3d)?data.lights3d:[data.light3d||{}];
          const used=new Set(),aim=PlanService.floorAim(plan);
          return values.map((value,index)=>{
            if(!value||typeof value!=='object')value={};
            let id=String(value.id||'light-'+(index+1)),base=id,suffix=2;
            while(used.has(id))id=base+'-'+suffix++;
            used.add(id);
            return {id,x:PlanService.finite(value.x,5000),y:PlanService.finite(value.y,-6000),z:PlanService.finite(value.z,9000),
              aimX:PlanService.finite(value.aimX,aim.aimX),aimY:PlanService.finite(value.aimY,aim.aimY),aimZ:PlanService.finite(value.aimZ,aim.aimZ),
              color:/^#[0-9a-f]{6}$/i.test(value.color)?value.color:'#ffffff',intensity:Math.max(0,PlanService.finite(value.intensity,2.5))};
          });
        }
        setLightValue(id,key,value) {
          if(!['x','y','z','aimX','aimY','aimZ','color','intensity'].includes(key))return false;
          const light=this.data.lights3d.find(light=>light.id===id),next=key==='color'?String(value):Number(value);
          if(!light||(key==='color'?!/^#[0-9a-f]{6}$/i.test(next):!Number.isFinite(next))||(key==='intensity'&&next<0))return false;
          light[key]=next;this.emit({type:'light-change',lightId:id,key,value:next});return true;
        }
        addLight() {
          let index=1;while(this.data.lights3d.some(light=>light.id==='light-'+index))index++;
          const previous=this.data.lights3d.at(-1),aim=PlanService.floorAim(this.data);
          const light={id:'light-'+index,x:previous?previous.x+1000:5000,y:previous?.y??-6000,z:previous?.z??9000,
            ...aim,color:previous?.color??'#ffffff',intensity:previous?.intensity??2.5};
          this.data.lights3d.push(light);this.emit({type:'light-add',lightId:light.id});return light.id;
        }
        removeLight(id) {
          const index=this.data.lights3d.findIndex(light=>light.id===id);if(index<0)return false;
          this.data.lights3d.splice(index,1);this.emit({type:'light-remove',lightId:id});return true;
        }
        static normalizePlacement(value) {
          if (!value || typeof value !== 'object') return null;
          return { type:value.type==='floor'?'floor':'wall', x:PlanService.finite(value.x), y:PlanService.finite(value.y), z:PlanService.finite(value.z), yaw:PlanService.finite(value.yaw) };
        }
        static normalizeWall(wall = {}) {
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
        static canvasFromWalls(walls = []) {
          let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
          const include=(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y))return;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);};
          for(const wall of walls){
            const angle=PlanService.finite(wall.rotation)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
            const includeLocal=(x,y)=>include(wall.x+x*cos-y*sin,wall.y+x*sin+y*cos);
            for(const point of wall.outline?.points||[]) includeLocal(point[0],point[1]);
            for(const object of wall.objects||[]) for(const [x,y] of [[object.x,object.y],[object.x+object.width,object.y],[object.x+object.width,object.y+object.height],[object.x,object.y+object.height]]) includeLocal(x,y);
          }
          if(![minX,minY,maxX,maxY].every(Number.isFinite)) return {x:0,y:0,width:0,height:0,flipY:0};
          return {x:minX,y:0,width:Math.max(0,maxX-minX),height:Math.max(0,maxY-minY),flipY:maxY};
        }
        static normalizeData(data = {}) {
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
        static wallIn(plan, name) { return plan?.walls?.find(wall => wall.name === name) || null; }
        onEvent(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
        emit(change = { type: 'change' }) {
          this.data.canvas = PlanService.canvasFromWalls(this.data.walls);
          publishPersistentPlan();
          for (const listener of [...this.listeners]) {
            try { listener(change); }
            catch (error) { console.error('PlanService change listener failed:', error); }
          }
        }
        get name() { return this.data?.name || 'Tiling plan'; }
        setName(name) { const oldName=this.data.name; this.data.name = String(name ?? '').trim() || 'Tiling plan'; this.emit({ type: 'name-change', oldName, name: this.data.name }); }
        replaceData(data, change = { type: 'replace' }, emit = true) {
          this.data = PlanService.normalizeData(data);
          if (emit) this.emit(change);
        }
        snapshot() { return structuredClone(this.data); }
        wall(name) { return PlanService.wallIn(this.data, name); }
        moveWall(wallName, x, y) {
          const wall=this.wall(wallName); if(!wall) return false;
          wall.x=Math.round(Number(x)||0); wall.y=Math.round(Number(y)||0);
          this.emit({type:'wall-move',wallName,x:wall.x,y:wall.y}); return true;
        }
        moveObject(wallName, objectIndex, x, y, objectName='') {
          const wall=this.wall(wallName); if(!wall) return false;
          const object=Number.isInteger(objectIndex)?wall.objects[objectIndex]:wall.objects.find(o=>o.name===objectName);
          if(!object) return false;
          object.x=Math.round(Number(x)||0); object.y=Math.round(Number(y)||0);
          this.emit({type:'object-move',wallName,objectIndex,objectName:object.name,x:object.x,y:object.y}); return true;
        }
        setPlacement3d(wallName,key,value) {
          if (!['type','x','y','z','yaw'].includes(key)) return false;
          const wall=this.wall(wallName); if(!wall)return false;
          const placement=wall.placement3d || ScenePlacement.suggest(this.data,wall,this.data.walls.indexOf(wall));
          if(key==='type'){ if(!['floor','wall'].includes(value))return false; }
          else {value=Number(value);if(!Number.isFinite(value))return false;}
          wall.placement3d={...placement,[key]:value};
          this.emit({type:'surface-placement',wallName,key,value}); return true;
        }
        setWallValue(wallName, key, value) {
          if (!new Set(['x','y','rotation']).has(key)) return false;
          const w=this.wall(wallName); if(!w)return false;
          const oldValue=w[key]; const next=Number(value); if(!Number.isFinite(next)) return false;
          w[key]=next; this.emit({type:'wall-change',wallName,key,oldValue,value:w[key]}); return true;
        }
        setObjectValue(wallName,index,key,value) {
          const allowed=new Set(['name','x','y','width','height','fill','depth']); if(!allowed.has(key)) return false;
          const o=this.wall(wallName)?.objects[index]; if(!o)return false;
          const objectName=o.name; const oldValue=o[key];
          if (key==='name' || key==='fill') o[key]=String(value);
          else { const next=Number(value); if(!Number.isFinite(next)) return false; o[key]=key==='depth'?Math.max(1,next):next; }
          this.emit({type:'object-change',wallName,index,objectName,key,oldValue,value:o[key]}); return true;
        }
        setOutlineValue(wallName,key,value) {
          const allowed=new Set(['pattern','patternRotation','fill','stroke','strokeWidth']); if(!allowed.has(key)) return false;
          const o=this.wall(wallName)?.outline; if(!o)return false; const oldValue=o[key];
          if (key==='strokeWidth'||key==='patternRotation') { const next=Number(value); if(!Number.isFinite(next)) return false; o[key]=next; }
          else o[key]=String(value ?? '');
          this.emit({type:'outline-change',wallName,key,oldValue,value:o[key]}); return true;
        }
        setOutlinePoints(wallName, points) {
          const o=this.wall(wallName)?.outline; if(!o || !Array.isArray(points)) return false;
          const normalized=points.map(PlanService.normalizePoint).filter(p=>p.every(Number.isFinite));
          if(normalized.length < 3) return false;
          const oldValue=o.points.map(p=>[...p]); o.points=normalized;
          this.emit({type:'outline-change',wallName,key:'points',oldValue,value:o.points.map(p=>[...p])}); return true;
        }
        setPatternValue(patternName,key,value) {
          const allowed=new Set(['tileWidth','tileHeight','borderSize','tileColor','borderColor','tileTexture','randomTextureRotation']); if(!allowed.has(key)) return false;
          const p=this.data.patterns.find(p=>p.name===patternName); if(!p)return false; const oldValue=p[key];
          if (key==='tileColor' || key==='borderColor' || key==='tileTexture') p[key]=String(value ?? '');
          else if (key==='randomTextureRotation') p[key]=Boolean(value);
          else { const next=Number(value); if(!Number.isFinite(next)) return false; p[key]=next; }
          this.emit({type:'pattern-change',patternName,key,oldValue,value:p[key]}); return true;
        }
        setPatternTranslation(wallName,x,y) { const o=this.wall(wallName)?.outline; if(!o)return false; o.patternX=Math.round(Number(x)||0); o.patternY=Math.round(Number(y)||0); this.emit({type:'pattern-move',wallName,x:o.patternX,y:o.patternY}); return true; }
        addPatternRegion(wallName, region = {}) { const w=this.wall(wallName); if(!w)return false; const added=PlanService.normalizePatternRegion(region); w.patternRegions.push(added); this.emit({type:'pattern-region-add',wallName,index:w.patternRegions.length-1,region:structuredClone(added)}); return true; }
        setPatternRegion(wallName,index,key,value) { const w=this.wall(wallName),r=w?.patternRegions?.[index]; if(!r||!new Set(['x','y','width','height','pattern','patternX','patternY','patternRotation']).has(key))return false; const oldValue=r[key]; if(key==='pattern')r[key]=String(value??''); else { const next=Number(value); if(!Number.isFinite(next))return false; r[key]=(key==='width'||key==='height')?Math.max(0,next):next; } this.emit({type:'pattern-region-change',wallName,index,key,oldValue,value:r[key]}); return true; }
        removePatternRegion(wallName,index) { const w=this.wall(wallName); if(!w||!w.patternRegions?.[index])return false; const [region]=w.patternRegions.splice(index,1); this.emit({type:'pattern-region-remove',wallName,index,region}); return true; }
        renameWall(oldName,newName) { const w=this.wall(oldName); const n=String(newName||'').trim(); if(!w||!n||this.wall(n))return false; w.name=n; this.emit({type:'wall-rename',wallName:n,oldName,newName:n}); return true; }
        addWall(wall) { const added=PlanService.normalizeWall(wall); this.data.walls.push(added); this.emit({type:'wall-add',wallName:added.name}); return true; }
        removeWall(name) { const i=this.data.walls.findIndex(w=>w.name===name); if(i<0)return false; const removed=this.data.walls[i]; this.data.walls.splice(i,1); this.emit({type:'wall-remove',wallName:removed.name}); return true; }
        resetWall(name, baseline) {
          const i=this.data.walls.findIndex(w=>w.name===name); if(i<0||!baseline)return false;
          const restored=PlanService.normalizeWall(baseline);
          if(restored.name!==name && this.data.walls.some((w,index)=>index!==i&&w.name===restored.name)) return false;
          const oldName=this.data.walls[i].name;
          this.data.walls[i]=restored;
          this.emit({type:'wall-reset',wallName:restored.name,oldName});
          return true;
        }
        addObject(wallName,object) { const w=this.wall(wallName); if(!w)return false; const added=PlanService.normalizeObject(object); w.objects.push(added); this.emit({type:'object-add',wallName,index:w.objects.length-1,objectName:added.name}); return true; }
        removeObject(wallName,index) { const w=this.wall(wallName); if(!w||!w.objects[index])return false; const removed=w.objects[index]; w.objects.splice(index,1); this.emit({type:'object-remove',wallName,index,objectName:removed.name}); return true; }
        resetObject(wallName,index,baseline) {
          const w=this.wall(wallName); if(!w||!w.objects[index]||!baseline)return false;
          const restored=PlanService.normalizeObject(baseline);
          w.objects[index]=restored;
          this.emit({type:'object-reset',wallName,index,objectName:restored.name});
          return true;
        }
        addPattern(pattern) { const p=PlanService.normalizePattern(pattern); if(!p.name||this.data.patterns.some(x=>x.name===p.name))return false; this.data.patterns.push(p); this.emit({type:'pattern-add',patternName:p.name}); return true; }
        duplicatePattern(name) { const source=this.data.patterns.find(p=>p.name===name); if(!source)return false; let i=1,copyName=name+'-copy'; while(this.data.patterns.some(p=>p.name===copyName))copyName=name+'-copy-'+(++i); const copy={...structuredClone(source),name:copyName}; this.data.patterns.splice(this.data.patterns.indexOf(source)+1,0,copy); this.emit({type:'pattern-duplicate',patternName:name,newName:copyName}); return true; }
        removePattern(name) { if(this.data.walls.some(w=>w.outline.pattern===name||w.patternRegions?.some(r=>r.pattern===name)))return false; const i=this.data.patterns.findIndex(p=>p.name===name); if(i<0)return false; this.data.patterns.splice(i,1); this.emit({type:'pattern-remove',patternName:name}); return true; }
        renamePattern(oldName,newName) { const p=this.data.patterns.find(p=>p.name===oldName); const n=String(newName||'').trim(); if(!p||!n||this.data.patterns.some(x=>x.name===n))return false; p.name=n; for(const w of this.data.walls){if(w.outline.pattern===oldName)w.outline.pattern=n;for(const r of w.patternRegions||[])if(r.pattern===oldName)r.pattern=n;} this.emit({type:'pattern-rename',oldName,newName:n}); return true; }
        reorderPattern(fromIndex,toIndex) { const a=this.data.patterns;if(!Number.isInteger(fromIndex)||!Number.isInteger(toIndex)||fromIndex<0||fromIndex>=a.length||toIndex<0||toIndex>=a.length||fromIndex===toIndex)return false;const [item]=a.splice(fromIndex,1);a.splice(toIndex,0,item);this.emit({type:'pattern-reorder',patternName:item.name,fromIndex,toIndex});return true; }
        reorderWall(fromIndex,toIndex) { const a=this.data.walls;if(!Number.isInteger(fromIndex)||!Number.isInteger(toIndex)||fromIndex<0||fromIndex>=a.length||toIndex<0||toIndex>=a.length||fromIndex===toIndex)return false;const [item]=a.splice(fromIndex,1);a.splice(toIndex,0,item);this.emit({type:'wall-reorder',wallName:item.name,fromIndex,toIndex});return true; }
        reorderObject(wallName,fromIndex,toIndex) { const a=this.wall(wallName)?.objects;if(!a||!Number.isInteger(fromIndex)||!Number.isInteger(toIndex)||fromIndex<0||fromIndex>=a.length||toIndex<0||toIndex>=a.length||fromIndex===toIndex)return false;const [item]=a.splice(fromIndex,1);a.splice(toIndex,0,item);this.emit({type:'object-reorder',wallName,objectName:item.name,fromIndex,toIndex});return true; }
      }
      class ScenePlacement {
        static floor(plan) {return plan.walls.find(w=>w.placement3d?.type==='floor') || plan.walls.find(w=>/^(floor|ground|boden)$/i.test(w.name));}
        static suggest(plan,wall,index) {
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
        static effective(plan,wall,index) {return wall.placement3d || ScenePlacement.suggest(plan,wall,index);}
      }

      const baseModelYaml = document.getElementById('base-model-yaml').textContent;
      const planService = new PlanService();
      const planSignal = signal(planService.snapshot());
      const interactionPlanSignal = signal(null);
      const lightVisibleSignal = signal(false);
      const yamlEditingSignal = signal(false);
      const selectedWallIdSignal = signal(null);
      const selectedObjectNameSignal = signal(null);
      const selectedObjectIndexSignal = signal(null);
      const effectivePlan = computed(() => interactionPlanSignal.value || planSignal.value);
      const publishPersistentPlan = () => { planSignal.value = planService.snapshot(); };
      const wallResetSnapshots = new Map();
      const objectResetSnapshots = new Map();
      const establishWallResetSnapshots = () => {
        wallResetSnapshots.clear();
        objectResetSnapshots.clear();
        for (const wall of planService.data.walls) {
          wallResetSnapshots.set(wall.name, structuredClone(wall));
          objectResetSnapshots.set(wall.name, wall.objects.map(object => structuredClone(object)));
        }
      };
      const resetWallToLoadedState = wallName => {
        const baseline = wallResetSnapshots.get(wallName);
        if (!baseline) { UiFeedback.message(`No loaded state is available for ${wallName}.`); return; }
        if (!planService.resetWall(wallName, baseline)) { UiFeedback.message(`Could not reset ${wallName}.`); return; }
        wallResetSnapshots.delete(wallName);
        wallResetSnapshots.set(baseline.name, structuredClone(baseline));
        if (editorState.selectedWallId === wallName) editorState.selectedWallId = baseline.name;
        objectResetSnapshots.delete(wallName);
        objectResetSnapshots.set(baseline.name, baseline.objects.map(object => structuredClone(object)));
        UiFeedback.message(`${baseline.name} reset.`);
      };
      const resetObjectToLoadedState = (wallName, objectIndex) => {
        const baseline = objectResetSnapshots.get(wallName)?.[objectIndex];
        const object = planService.wall(wallName)?.objects[objectIndex];
        if (!baseline || !object) { UiFeedback.message('No loaded state is available for this element.'); return; }
        if (!planService.resetObject(wallName, objectIndex, baseline)) { UiFeedback.message(`Could not reset ${object.name || 'element'}.`); return; }
        objectResetSnapshots.get(wallName)[objectIndex] = structuredClone(baseline);
        UiFeedback.message(`${baseline.name || 'Element'} reset.`);
      };
      class ViewController {
        static updateViewMode() {
          const split = splitToggle.checked, showSource = sourceToggle.checked, showThree = threeToggle.checked;
          sourceToggle.disabled = split;
          splitToggle.disabled = showSource;
          viewPanels.classList.toggle('side-by-side', split);
          preview.hidden = showThree || (!split && showSource);
          threeContainer.hidden = !showThree || (!split && showSource);
          if (!threeContainer.hidden) threePreview.activate();
          sourceView.hidden = !split && !showSource;
          document.getElementById('view-title').textContent = split ? ((showThree?'3D preview':'Preview')+' + YAML source') : (showSource ? 'YAML source' : (showThree?'3D preview':'Preview'));
          requestAnimationFrame(ViewController.drawCanvas);
        }
        static updateView() { zoomLevel.textContent = Math.round(view.scale * 100) + '%'; ViewController.drawCanvas(); }
        static drawCanvasNow() { canvasRenderFrame = 0; CanvasRenderer.paint(effectivePlan.value); }
        static drawCanvas() { renderScheduler.request(); }
        static zoomAt(factor, clientX, clientY) { viewport.zoomAt(clientX, clientY, factor); }
        static fittedDrawingBox(paddingRatio = 0.04) {
          const plan = effectivePlan.value;
          const bounds = GeometryTools.planBounds(plan); if (!bounds) return null;
          const minY = plan.canvas.flipY - bounds.maxY, maxY = plan.canvas.flipY - bounds.minY;
          const width = bounds.maxX - bounds.minX, height = maxY - minY;
          if (!(width > 0 && height > 0)) return null;
          const pad = Math.max(width, height) * paddingRatio;
          return [bounds.minX-pad, minY-pad, width+pad*2, height+pad*2];
        }
        static fitView() { view.scale=1; view.box=ViewController.fittedDrawingBox() || [...baseBox]; ViewController.updateView(); }
        static drawingBounds() {
          const bounds=GeometryTools.planBounds(effectivePlan.value);
          return bounds ? {x:bounds.minX,y:bounds.minY,width:bounds.maxX-bounds.minX,height:bounds.maxY-bounds.minY} : null;
        }
      }
      class SourcePresentation {
        static escapeHtml(value) { return value.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]); }
        static updateHighlight() {
          highlightCode.innerHTML = source.value.split('\n').map(line => {
            if (/^\s*#/.test(line)) return '<span class="syntax-comment">'+SourcePresentation.escapeHtml(line)+'</span>';
            const match=line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:\s*)(.*)$/);
            if(!match) return SourcePresentation.escapeHtml(line);
            const scalar=match[4], hs=(scalar==='|'||scalar==='|-'||scalar==='|+') ? '<span class="syntax-punctuation">'+SourcePresentation.escapeHtml(scalar)+'</span>' : '<span class="syntax-value">'+SourcePresentation.escapeHtml(scalar)+'</span>';
            return SourcePresentation.escapeHtml(match[1])+'<span class="syntax-attribute">'+SourcePresentation.escapeHtml(match[2])+'</span>'+SourcePresentation.escapeHtml(match[3])+hs;
          }).join('\n')+'\n';
          highlight.scrollTop=source.scrollTop; highlight.scrollLeft=source.scrollLeft;
        }
      }
      class UiFeedback {
        static message(value) { status.textContent=value; clearTimeout(UiFeedback.timer); UiFeedback.timer=setTimeout(()=>{status.textContent='';},3500); }
      }
      class TitleController {
        static update() { const name=planService.name; planTitle.textContent=name; document.title=`${name} · Canvas editor`; }
        static downloadBaseName() { const safe=planService.name.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); return safe||'tiling-plan'; }
        static beginEdit() {
          if(document.getElementById('plan-title-input'))return;
          const input=document.createElement('input'); input.id='plan-title-input'; input.className='title-input'; input.type='text'; input.value=planService.name; input.setAttribute('aria-label','Plan title');
          planTitle.hidden=true; editPlanTitle.before(input); input.focus(); input.select(); let finished=false;
          const finish=commit=>{if(finished)return;finished=true;if(commit)planService.setName(input.value);input.remove();planTitle.hidden=false;TitleController.update();};
          input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finish(true);}else if(e.key==='Escape'){e.preventDefault();finish(false);}}); input.addEventListener('blur',()=>finish(true));
        }
      }
      const preview = document.getElementById('preview');
      const stage = document.getElementById('canvas-stage');
      const canvas = document.getElementById('plan-canvas');
      const ctx = canvas.getContext('2d');
      const showLabels = document.getElementById('show-labels');
      const showDimensions = document.getElementById('show-dimensions');
      showLabels.addEventListener('change', ViewController.drawCanvas);
      showDimensions.addEventListener('change', ViewController.drawCanvas);
      const zoomLevel = document.getElementById('zoom-level');
      const EMPTY_VIEW_BOX = [0, 0, 3000, 3000];
      let baseBox = [...EMPTY_VIEW_BOX];
      const view = { scale: 1, box: [...baseBox] };
      const source = document.getElementById('source');
      const highlight = document.getElementById('source-highlight');
      const highlightCode = document.getElementById('highlight-code');
      const sourceStatus = document.getElementById('source-status');
      const tileControls = document.getElementById('tile-controls');
      const lightControls = document.getElementById('light-controls');
      const wallControls = document.getElementById('wall-controls');
      const status = document.getElementById('status');
      const actionConsoleLog = document.getElementById('action-console-log');
      const ActionConsole = {
        log(message) {
          const line = document.createElement('div');
          line.className = 'action-console-line';
          const now = new Date();
          const stamp = [now.getHours(), now.getMinutes(), now.getSeconds()].map(value => String(value).padStart(2, '0')).join(':');
          line.textContent = stamp + '  ' + message;
          actionConsoleLog.appendChild(line);
          while (actionConsoleLog.children.length > 80) actionConsoleLog.removeChild(actionConsoleLog.firstChild);
          actionConsoleLog.scrollTop = actionConsoleLog.scrollHeight;
        },
        clear() { actionConsoleLog.textContent = ''; }
      };
      document.getElementById('clear-action-log').addEventListener('click', () => ActionConsole.clear());
      ActionConsole.log('Editor ready — no template loaded.');

      // The plan stays plain data; each persistent operation publishes a fresh snapshot.
      const NumberField = ({label,value,onInput,min=-10000,max=10000,range=false,unit=' mm'}) => h('label',{class:range?'slider-label':undefined},
        range ? h('span',{class:'slider-heading'},h('span',null,label),h('output',null,`${number(Number(value)||0)}${unit}`)) : label,
        h('input',{type:range?'range':'number',value:number(Number(value)||0),min,max,step:1,onInput:event=>onInput(Number(event.currentTarget.value))})
      );
      const Button = ({children,onClick,className='add-element'}) => h('button',{type:'button',class:className,onClick},children);
      const PatternSelect = ({value,onChange,patterns}) => h('label',null,'Pattern',h('select',{value:value||'',onChange:e=>onChange(e.currentTarget.value)},h('option',{value:''},'No pattern'),patterns.map(p=>h('option',{key:p.name,value:p.name},p.name))));
      function confirmRemoval(message,onConfirm) {
        const dialog=document.createElement('dialog');dialog.className='confirm-dialog';
        dialog.innerHTML='<p></p><div class="confirm-dialog-actions"><button type="button">Cancel</button><button type="button" class="confirm-remove">Remove</button></div>';
        dialog.querySelector('p').textContent=message;document.body.append(dialog);
        const close=()=>{dialog.close();dialog.remove();};
        dialog.querySelector('button').onclick=close;
        dialog.querySelector('.confirm-remove').onclick=()=>{close();onConfirm();};
        dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
        dialog.addEventListener('click',e=>{if(e.target===dialog)close();});dialog.showModal();
      }
      function EditableName({title,onRename,onRemove,kind}) {
        const [editing,setEditing]=useState(false),input=useRef(null);
        useEffect(()=>{if(editing){input.current?.focus();input.current?.select();}},[editing]);
        const finish=(commit)=>{if(commit)onRename(input.current?.value||'');setEditing(false);};
        return h('span',{class:'control-name'},editing
          ?h('input',{ref:input,class:'control-name-input',defaultValue:title,onClick:e=>e.stopPropagation(),onPointerDown:e=>e.stopPropagation(),onBlur:()=>finish(true),onKeyDown:e=>{if(e.key==='Enter'){e.preventDefault();finish(true);}if(e.key==='Escape'){e.preventDefault();finish(false);}}})
          :h('strong',null,title),
          h('button',{type:'button',class:'control-name-edit','aria-label':`Edit ${title} name`,title:'Edit name',onPointerDown:e=>e.preventDefault(),onClick:e=>{e.preventDefault();e.stopPropagation();setEditing(true);}},'✎'),
          onRemove&&h('button',{type:'button',class:'control-name-remove','aria-label':`Remove ${kind} ${title}`,onClick:e=>{e.preventDefault();e.stopPropagation();confirmRemoval(`Remove ${kind} “${title}”?`,onRemove);}},'×'));
      }
      let activeReorderDrag=null;
      const reorderHandlers=(type,index,wallName='')=>({
        onDragOver:e=>{if(!activeReorderDrag||activeReorderDrag.type!==type||(type==='object'&&activeReorderDrag.wallName!==wallName))return;e.preventDefault();e.currentTarget.classList.toggle('drop-before',e.clientY<e.currentTarget.getBoundingClientRect().top+e.currentTarget.offsetHeight/2);e.currentTarget.classList.toggle('drop-after',!e.currentTarget.classList.contains('drop-before'));},
        onDragLeave:e=>{e.currentTarget.classList.remove('drop-before','drop-after');},
        onDrop:e=>{const payload=activeReorderDrag;e.currentTarget.classList.remove('drop-before','drop-after');if(!payload||payload.type!==type||(type==='object'&&payload.wallName!==wallName))return;e.preventDefault();e.stopPropagation();let target=index+(e.clientY<e.currentTarget.getBoundingClientRect().top+e.currentTarget.offsetHeight/2?0:1);if(payload.index<target)target--;if(type==='pattern')planService.reorderPattern(payload.index,target);else if(type==='wall')planService.reorderWall(payload.index,target);else planService.reorderObject(wallName,payload.index,target);activeReorderDrag=null;}
      });
      const ReorderHandle=({type,index,wallName=''})=>h('span',{class:'reorder-handle',draggable:true,role:'button','aria-label':'Drag to reorder',title:'Drag to reorder',onClick:e=>{e.preventDefault();e.stopPropagation();},onDragStart:e=>{e.stopPropagation();activeReorderDrag={type,index,wallName};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','reorder');},onDragEnd:()=>{activeReorderDrag=null;document.querySelectorAll('.drop-before,.drop-after').forEach(node=>node.classList.remove('drop-before','drop-after'));}},'⋮⋮');
      function Card({title,children,onRename,onRemove,kind='item',reorder,selected=false,defaultOpen=false}) {
        const ref=useRef(null);
        useEffect(()=>{if(!selected)return;const node=ref.current;if(node){node.open=true;node.scrollIntoView({behavior:'smooth',block:'nearest'});}},[selected]);
        return h('details',{class:'group-card',ref,open:defaultOpen?true:undefined,...(reorder?reorderHandlers(...reorder):{})},
          h('summary',{class:'group-top'},reorder&&h(ReorderHandle,{type:reorder[0],index:reorder[1],wallName:reorder[2]}),onRename?h(EditableName,{title,onRename,onRemove,kind}):h('strong',null,title)),
          children);
      }
      const PatternRegions=({wall,patterns})=>h('div',{class:'pattern-regions'},
        wall.patternRegions.map((r,i)=>h(Card,{key:i,title:`Pattern region ${i+1}`,defaultOpen:true},h('div',{class:'coords'},
          ...['x','y','width','height'].map(key=>h(NumberField,{key,label:key[0].toUpperCase()+key.slice(1),value:r[key],min:key==='width'||key==='height'?0:-10000,onInput:v=>planService.setPatternRegion(wall.name,i,key,v)})),
          h(PatternSelect,{value:r.pattern,patterns,onChange:v=>planService.setPatternRegion(wall.name,i,'pattern',v)}),
          ...['patternX','patternY'].map(key=>h(NumberField,{key,label:key==='patternX'?'Pattern X':'Pattern Y',value:r[key],min:-6000,max:6000,range:true,onInput:v=>planService.setPatternRegion(wall.name,i,key,v)})),
          h(NumberField,{label:'Pattern rotation',value:r.patternRotation,min:0,max:359,range:true,unit:'°',onInput:v=>planService.setPatternRegion(wall.name,i,'patternRotation',v)}),
          h(Button,{className:'remove-element wide',onClick:()=>planService.removePatternRegion(wall.name,i)},'Remove region')))),
        h(Button,{onClick:()=>planService.addPatternRegion(wall.name,{x:0,y:0,width:600,height:600,pattern:patterns[0]?.name||''})},'Add pattern region'));
      function PatternCard({p,index}) {
        const set=(key,value)=>planService.setPatternValue(p.name,key,value);
        return h(Card,{title:p.name,onRename:v=>planService.renamePattern(p.name,v),onRemove:()=>{if(!planService.removePattern(p.name))UiFeedback.message(`Pattern “${p.name}” is still used by a wall.`);},kind:'tile pattern',reorder:['pattern',index]},h('div',{class:'coords'},
          ...[['tileWidth','Tile width',1,6000],['tileHeight','Tile height',1,6000],['borderSize','Border size',0,1000]].map(([key,label,min,max])=>h(NumberField,{key,label,value:p[key],min,max,onInput:v=>set(key,v)})),
          h('label',null,'Tile',h('input',{type:'color',value:/^#[0-9a-f]{6}$/i.test(p.tileColor)?p.tileColor:'#ffffff',onInput:e=>set('tileColor',e.currentTarget.value)})),
          h('label',null,'Border',h('input',{type:'color',value:/^#[0-9a-f]{6}$/i.test(p.borderColor)?p.borderColor:'#888888',onInput:e=>set('borderColor',e.currentTarget.value)})),
          h('div',{class:'wide'},h(Button,{onClick:()=>planService.duplicatePattern(p.name)},'Duplicate pattern'),h(Button,{onClick:e=>e.currentTarget.nextSibling.click()},p.tileTexture?'Replace texture':'Upload texture'),h('input',{type:'file',accept:'image/*',hidden:true,onChange:e=>{const file=e.currentTarget.files?.[0];if(file){const reader=new FileReader();reader.onload=()=>set('tileTexture',String(reader.result||''));reader.readAsDataURL(file);}}}),p.tileTexture&&h(Button,{onClick:()=>set('tileTexture','')},'Remove texture')),
          h('label',{class:'wide'},h('input',{type:'checkbox',checked:!!p.randomTextureRotation,style:'width:auto;display:inline-block;margin:0 7px 0 0',onChange:e=>set('randomTextureRotation',e.currentTarget.checked)}),'Random texture rotation')));
      }
      function ObjectCard({wall,o,index}) {
        const selected=selectedWallIdSignal.value===wall.name&&selectedObjectIndexSignal.value===index;
        return h(Card,{title:o.name,key:index,selected,onRename:v=>planService.setObjectValue(wall.name,index,'name',v),onRemove:()=>{planService.removeObject(wall.name,index);if(selected)selection.clear();},kind:'element',reorder:['object',index,wall.name]},
          h(Button,{className:'card-reset',onClick:()=>resetObjectToLoadedState(wall.name,index)},'Reset element'),h('div',{class:'coords'},
          ...[['x','X',-6000,6000],['y','Y',-6000,6000],['width','Width',1,6000],['height','Height',1,6000]].map(([key,label,min,max])=>h(NumberField,{key,label,value:o[key],min,max,range:true,onInput:v=>planService.setObjectValue(wall.name,index,key,key==='x'||key==='y'?Math.round(v):v)})),
          h(NumberField,{label:'3D depth / floor height',value:o.depth,min:1,max:6000,onInput:v=>planService.setObjectValue(wall.name,index,'depth',v)}),
          h('label',null,'Fill',h('input',{type:'color',value:/^#[0-9a-f]{6}$/i.test(o.fill)?o.fill:'#ff0000',onInput:e=>planService.setObjectValue(wall.name,index,'fill',e.currentTarget.value)}))));
      }
      function PlacementControls({wall,index}) {
        const placement=wall.placement3d || ScenePlacement.suggest(effectivePlan.value,wall,index);
        return h(Card,{title:'3D placement'},h('div',{class:'coords'},
          h('p',{class:'wide hint'},wall.placement3d?'Explicit placement. X/Y locate the surface on the ground; Z is elevation.':'Suggested placement. Floor lies on XY; Z is elevation. Edit a value to save explicit placement.'),
          h('label',{class:'wide'},'Surface',h('select',{value:placement.type,onChange:e=>planService.setPlacement3d(wall.name,'type',e.currentTarget.value)},h('option',{value:'wall'},'Vertical wall'),h('option',{value:'floor'},'Horizontal floor'))),
          ...['x','y','z'].map(key=>h(NumberField,{key,label:'3D '+key.toUpperCase(),value:placement[key],min:-50000,max:50000,onInput:v=>planService.setPlacement3d(wall.name,key,v)})),
          h(NumberField,{label:'3D angle',value:placement.yaw,min:-360,max:360,range:true,unit:'°',onInput:v=>planService.setPlacement3d(wall.name,'yaw',v)})));
      }
      function WallSection({wall,index,patterns}) {
        const selected=selectedWallIdSignal.value===wall.name,section=useRef(null);
        useEffect(()=>{if(selected&&section.current){section.current.closest('#walls-section').open=true;section.current.open=true;section.current.scrollIntoView({behavior:'smooth',block:'nearest'});}},[selected]);
        return h('details',{class:'wall-section control-section',ref:section,...reorderHandlers('wall',index)},
          h('summary',null,h(ReorderHandle,{type:'wall',index}),h(EditableName,{title:wall.name,onRename:v=>{const next=String(v).trim();if(planService.renameWall(wall.name,next)&&selected)selectedWallIdSignal.value=next;},onRemove:()=>{planService.removeWall(wall.name);if(selected)selection.clear();},kind:'wall'})),
          h('div',{class:'wall-content'},
            h(Card,{title:wall.name,selected:selected&&selectedObjectIndexSignal.value===null},
              h(Button,{className:'card-reset',onClick:()=>resetWallToLoadedState(wall.name)},'Reset wall'),h('div',{class:'coords'},
              ...['x','y','rotation'].map(key=>h(NumberField,{key,label:key==='rotation'?'Rotation':key.toUpperCase(),value:wall[key],min:key==='rotation'?0:-10000,max:key==='rotation'?359:10000,range:true,unit:key==='rotation'?'':' mm',onInput:v=>planService.setWallValue(wall.name,key,key==='rotation'?v:Math.round(v))})),
              h(PatternSelect,{value:wall.outline.pattern,patterns,onChange:v=>planService.setOutlineValue(wall.name,'pattern',v)}),
              ...['patternX','patternY'].map(key=>h(NumberField,{key,label:key==='patternX'?'Pattern X':'Pattern Y',value:wall.outline[key],min:-6000,max:6000,range:true,onInput:v=>planService.setPatternTranslation(wall.name,key==='patternX'?v:wall.outline.patternX,key==='patternY'?v:wall.outline.patternY)})),
              h(NumberField,{label:'Pattern rotation',value:wall.outline.patternRotation,min:0,max:359,range:true,unit:'°',onInput:v=>planService.setOutlineValue(wall.name,'patternRotation',v)}))),
            h(PlacementControls,{wall,index}),
            h(PatternRegions,{wall,patterns}),
            h(Card,{title:'outline'},h('div',{class:'coords'},h('label',{class:'wide'},'Points',h('textarea',{defaultValue:wall.outline.points.map(p=>`${number(p[0])},${number(p[1])}`).join(' '),onInput:e=>{const points=e.currentTarget.value.trim().split(/\s+/).map(pair=>pair.split(',').map(Number)).filter(p=>p.length===2&&p.every(Number.isFinite));if(points.length>=3)planService.setOutlinePoints(wall.name,points);}})))),
            wall.objects.map((o,i)=>h(ObjectCard,{key:i,wall,o,index:i})),
            h(Button,{onClick:()=>planService.addObject(wall.name,{name:'element',x:0,y:0,width:600,height:600,fill:'#ff0000'})},'Add element'),
            h(Button,{onClick:()=>planService.setWallValue(wall.name,'rotation',(wall.rotation+90)%360)},'Rotate 90°')));
      }
      function LightControls() {
        const lights=effectivePlan.value.lights3d;
        return h(Fragment,null,
          h('p',{class:'hint'},'Coordinates in mm. Position locates the light; Aim selects the point it illuminates. Z is height.'),
          lights.map((light,index)=>h(Card,{key:light.id,title:'Directional light '+(index+1),defaultOpen:true},
            h('div',{class:'coords'},
              h('label',null,'Light color',h('input',{type:'color',value:light.color,onInput:event=>planService.setLightValue(light.id,'color',event.currentTarget.value)})),
              h('label',null,'Intensity',h('input',{type:'number',value:light.intensity,min:0,step:.1,onInput:event=>planService.setLightValue(light.id,'intensity',event.currentTarget.value)})),
              h('strong',{class:'wide'},'Position'),
              ...['x','y','z'].map(key=>h(NumberField,{key,label:'Position '+key.toUpperCase(),value:light[key],min:-50000,max:50000,onInput:value=>planService.setLightValue(light.id,key,value)})),
              h('strong',{class:'wide'},'Aim'),
              ...['aimX','aimY','aimZ'].map(key=>h(NumberField,{key,label:'Aim '+key.slice(-1),value:light[key],min:-50000,max:50000,onInput:value=>planService.setLightValue(light.id,key,value)})),
              h(Button,{className:'remove-element wide',onClick:()=>confirmRemoval('Remove this directional light?',()=>planService.removeLight(light.id))},'Remove light')))),
          h(Button,{onClick:()=>planService.addLight()},'Add directional light'));
      }
      function ControlPanelView() {
        const plan=effectivePlan.value;
        return h(Fragment,null,
          createPortal(h(LightControls),lightControls),
          createPortal(h(Fragment,null,plan.patterns.map((p,i)=>h(PatternCard,{key:p.name,p,index:i})),h(Button,{onClick:()=>{let i=1,n=`tile-pattern-${i}`;while(plan.patterns.some(p=>p.name===n))n=`tile-pattern-${++i}`;planService.addPattern({name:n,tileWidth:300,tileHeight:300,borderSize:0,tileColor:'#ffffff',borderColor:'#888888'});}},'Add tile pattern')),tileControls),
          createPortal(h(Fragment,null,plan.walls.map((wall,i)=>h(WallSection,{key:wall.name,wall,index:i,patterns:plan.patterns}))),wallControls));
      }
      const sidebarMount = document.createElement('div');
      wallControls.parentNode.append(sidebarMount);
      const editorState = new EditorState();
      Object.defineProperty(editorState, 'interactionPlan', {
        get: () => interactionPlanSignal.value,
        set: value => { interactionPlanSignal.value = value; }
      });
      Object.defineProperties(editorState, {
        selectedWallId: { get: () => selectedWallIdSignal.value, set: value => { selectedWallIdSignal.value = value; } },
        selectedObjectName: { get: () => selectedObjectNameSignal.value, set: value => { selectedObjectNameSignal.value = value; } },
        selectedObjectIndex: { get: () => selectedObjectIndexSignal.value, set: value => { selectedObjectIndexSignal.value = value; } }
      });

      const serializer = new XMLSerializer();
      const number = value => Number.isFinite(value) ? String(Number(value.toFixed(4))) : '0';
      const translateRe = /(?:^|\s)translate\(\s*([+-]?(?:\d+\.?\d*|\.\d+))(?:[\s,]+([+-]?(?:\d+\.?\d*|\.\d+)))?\s*\)/;
      const threeToggle = document.getElementById('three-toggle');
      const threeContainer = document.getElementById('preview-3d');
      threeToggle.addEventListener('change',ViewController.updateViewMode);
      const sourceToggle = document.getElementById('source-toggle');
      const splitToggle = document.getElementById('split-toggle');
      const sourceView = document.getElementById('source-view');
      const viewPanels = document.getElementById('view-panels');
      sourceToggle.addEventListener('change', () => {
        if (sourceToggle.checked) splitToggle.checked = false;
        ViewController.updateViewMode();
      });
      splitToggle.addEventListener('change', () => {
        if (splitToggle.checked) sourceToggle.checked = false;
        ViewController.updateViewMode();
      });
      class CanvasViewport {
        constructor(canvas, view, onChange) {
          this.canvas = canvas;
          this.view = view;
          this.onChange = onChange;
          this.minZoom = 0.25;
          this.maxZoom = 30;
        }
        metrics() {
          const rect = this.canvas.getBoundingClientRect();
          const scale = Math.min(rect.width / this.view.box[2], rect.height / this.view.box[3]);
          const width = this.view.box[2] * scale;
          const height = this.view.box[3] * scale;
          return { rect, scale, left: (rect.width - width) / 2, top: (rect.height - height) / 2, width, height };
        }
        screenToWorld(clientX, clientY) {
          const viewport = this.metrics();
          return {
            x: this.view.box[0] + (clientX - viewport.rect.left - viewport.left) / viewport.scale,
            y: this.view.box[1] + (clientY - viewport.rect.top - viewport.top) / viewport.scale
          };
        }
        screenToPlan(clientX, clientY) { return this.screenToWorld(clientX, clientY); }
        zoomAt(clientX, clientY, factor) {
          const next = Math.max(this.minZoom, Math.min(this.maxZoom, this.view.scale * factor));
          if (next === this.view.scale) return;
          const anchor = this.screenToWorld(clientX, clientY);
          const ratio = this.view.scale / next;
          this.view.box[0] = anchor.x - (anchor.x - this.view.box[0]) * ratio;
          this.view.box[1] = anchor.y - (anchor.y - this.view.box[1]) * ratio;
          this.view.box[2] *= ratio;
          this.view.box[3] *= ratio;
          this.view.scale = next;
          this.onChange?.();
        }
        panByScreenDelta(dx, dy) {
          const { scale } = this.metrics();
          if (!scale) return;
          this.view.box[0] -= dx / scale;
          this.view.box[1] -= dy / scale;
          this.onChange?.();
        }
      }
      const viewport = new CanvasViewport(canvas, view, ViewController.updateView);
      let canvasRenderToken = 0;
      let canvasRenderFrame = 0;
      class RenderScheduler {
        constructor(render) { this.render = render; this.pending = false; }
        request() {
          if (this.pending) return;
          this.pending = true;
          canvasRenderFrame = requestAnimationFrame(() => {
            this.pending = false;
            this.render();
          });
        }
      }
      const renderScheduler = new RenderScheduler(ViewController.drawCanvasNow);
      new ResizeObserver(ViewController.drawCanvas).observe(stage);
      class Selection {
        constructor(state, requestRender) {
          this.state = state;
          this.requestRender = requestRender;
        }
        select(hit) {
          this.state.selectedWallId = hit?.wallId || null;
          this.state.selectedObjectName = hit?.objectName || null;
          this.state.selectedObjectIndex = Number.isInteger(hit?.objectIndex) ? hit.objectIndex : null;
          this.requestRender?.();
        }
        clear() { this.select(null); }
      }

      class GeometryTools {
        static planBounds(planInput) {
          const plan = planInput;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          const include = (x, y) => {
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          };
          const transform = (wall, x, y) => {
            const angle = wall.rotation * Math.PI / 180;
            const cos = Math.cos(angle), sin = Math.sin(angle);
            return {
              x: wall.x + x * cos - y * sin,
              y: wall.y + x * sin + y * cos
            };
          };
          for (const wall of plan.walls) {
            for (const point of wall.outline.points) {
              const world = transform(wall, point[0], point[1]);
              include(world.x, world.y);
            }
            for (const object of wall.objects) {
              for (const [x, y] of [
                [object.x, object.y],
                [object.x + object.width, object.y],
                [object.x + object.width, object.y + object.height],
                [object.x, object.y + object.height]
              ]) {
                const world = transform(wall, x, y);
                include(world.x, world.y);
              }
            }
          }
          return [minX, minY, maxX, maxY].every(Number.isFinite)
            ? { minX, minY, maxX, maxY }
            : null;
        }
        static worldToLocal(point, transform) {
          const dx = point.x - (transform.x || 0);
          const dy = point.y - (transform.y || 0);
          const angle = -(transform.rotation || 0) * Math.PI / 180;
          const cos = Math.cos(angle), sin = Math.sin(angle);
          return {
            x: dx * cos - dy * sin,
            y: dx * sin + dy * cos
          };
        }
        static pointInPolygon(p, pts) {
          let inside = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const a = pts[i], b = pts[j];
            if (((a.y > p.y) !== (b.y > p.y)) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside = !inside;
          }
          return inside;
        }
        static pointOnSegment(p, a, b, epsilon = 1e-7) {
          const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
          if (Math.abs(cross) > epsilon) return false;
          return p.x >= Math.min(a.x, b.x) - epsilon && p.x <= Math.max(a.x, b.x) + epsilon &&
                 p.y >= Math.min(a.y, b.y) - epsilon && p.y <= Math.max(a.y, b.y) + epsilon;
        }
        static pointInPolygonInclusive(p, pts) {
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            if (GeometryTools.pointOnSegment(p, pts[j], pts[i])) return true;
          }
          return GeometryTools.pointInPolygon(p, pts);
        }
        static segmentsProperlyIntersect(a, b, c, d, epsilon = 1e-7) {
          const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
          const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
          return ((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon)) &&
                 ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon));
        }
        static rectangleInsidePolygon(x, y, width, height, polygon) {
          if (!polygon || polygon.length < 3) return false;
          const corners = [
            { x, y }, { x: x + width, y },
            { x: x + width, y: y + height }, { x, y: y + height }
          ];
          if (!corners.every(point => GeometryTools.pointInPolygonInclusive(point, polygon))) return false;
          const rectEdges = corners.map((point, index) => [point, corners[(index + 1) % corners.length]]);
          for (let i = 0; i < polygon.length; i++) {
            const edge = [polygon[i], polygon[(i + 1) % polygon.length]];
            for (const rectEdge of rectEdges) {
              if (GeometryTools.segmentsProperlyIntersect(rectEdge[0], rectEdge[1], edge[0], edge[1])) return false;
            }
          }
          return true;
        }
      }

      class HitTester {
        constructor(planProvider) { this.planProvider = planProvider; }
        hitTest(worldPoint) {
          const supplied = typeof this.planProvider === 'function' ? this.planProvider() : this.planProvider;
          const plan = supplied;
          const flipY = Number(plan.canvas.flipY || 0);
          const planPoint = { x: worldPoint.x, y: flipY - worldPoint.y };
          for (const wall of [...plan.walls].reverse()) {
            const local = GeometryTools.worldToLocal(planPoint, wall);
            for (let objectIndex = wall.objects.length - 1; objectIndex >= 0; objectIndex--) {
              const object = wall.objects[objectIndex];
              const objectHit = local.x >= object.x && local.x <= object.x + object.width && local.y >= object.y && local.y <= object.y + object.height;
              if (objectHit) {
                return { type: 'object', wallId: wall.name, objectName: object.name, objectIndex };
              }
            }
            const outline = wall.outline.points.map(([x, y]) => ({ x, y }));
            const wallHit = outline.length >= 3 && GeometryTools.pointInPolygon(local, outline);
            if (wallHit) {
              return { type: 'wall', wallId: wall.name };
            }
          }
          return null;
        }
      }

      class PointerController {
        constructor(element, viewport, hitTester, selection, planService) {
          this.element = element;
          this.viewport = viewport;
          this.hitTester = hitTester;
          this.selection = selection;
          this.planService = planService;
          this.gesture = null;
          this.touchPoints = new Map();
          this.pinch = null;
          this.clickThreshold = 5;
          this.bind();
        }
        bind() {
          this.element.addEventListener('wheel', event => {
            event.preventDefault();
            this.viewport.zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015));
          }, { passive: false });
          this.element.addEventListener('pointerdown', event => this.pointerDown(event));
          this.element.addEventListener('pointermove', event => this.pointerMove(event));
          this.element.addEventListener('pointerup', event => this.pointerUp(event));
          this.element.addEventListener('pointercancel', event => this.pointerCancel(event));
        }
        resolveTarget(hit) { return hit ? { semantic: hit } : null; }
        pointerDown(event) {
          if (event.target.closest('.zoom-controls')) return;
          if (event.pointerType === 'touch') {
            this.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
            try { this.element.setPointerCapture(event.pointerId); } catch (_) {}
            if (this.touchPoints.size >= 2) {
              const points = [...this.touchPoints.entries()].slice(0, 2);
              const a = points[0][1], b = points[1][1];
              this.pinch = {
                ids: [points[0][0], points[1][0]],
                distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
                midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2
              };
              this.gesture = null;
              editorState.interactionPlan = null;
              this.element.classList.add('dragging');
              event.preventDefault();
              return;
            }
          }
          if (event.button !== 0) return;
          const world = this.viewport.screenToWorld(event.clientX, event.clientY);
          const hit = this.hitTester.hitTest(world);
          const target = this.resolveTarget(hit);
          const dragPlan = hit && target ? structuredClone(planSignal.value) : null;
          const dragWall = hit ? PlanService.wallIn(dragPlan, hit.wallId) : null;
          const dragObject = hit?.type === 'object'
            ? (dragWall?.objects[hit.objectIndex] || dragWall?.objects.find(object => object.name === hit.objectName))
            : null;
          const initial = hit?.type === 'wall' && dragWall
            ? [dragWall.x, dragWall.y]
            : (hit?.type === 'object' && dragObject ? [dragObject.x, dragObject.y] : null);
          if (dragPlan) interactionPlanSignal.value = dragPlan;
          this.gesture = {
            pointerId: event.pointerId,
            startX: event.clientX, startY: event.clientY,
            lastX: event.clientX, lastY: event.clientY,
            startWorld: world, hit, target, initial, dragPlan,
            wallRotation: dragWall?.rotation || 0,
            moved: false,
            mode: hit && target ? 'drag' : 'pan'
          };
          if (hit) this.selection.select(hit);
          this.element.setPointerCapture(event.pointerId);
          this.element.classList.add('dragging');
        }
        pointerMove(event) {
          if (event.pointerType === 'touch' && this.touchPoints.has(event.pointerId)) {
            this.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (this.pinch) {
              const a = this.touchPoints.get(this.pinch.ids[0]);
              const b = this.touchPoints.get(this.pinch.ids[1]);
              if (a && b) {
                const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
                const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
                this.viewport.panByScreenDelta(midX - this.pinch.midX, midY - this.pinch.midY);
                this.viewport.zoomAt(midX, midY, distance / this.pinch.distance);
                this.pinch.distance = distance;
                this.pinch.midX = midX; this.pinch.midY = midY;
                event.preventDefault();
                return;
              }
            }
          }
          const g = this.gesture;
          if (!g || event.pointerId !== g.pointerId) return;
          const dx = event.clientX - g.startX;
          const dy = event.clientY - g.startY;
          if (!g.moved && Math.hypot(dx, dy) <= this.clickThreshold) return;
          g.moved = true;
          if (g.mode === 'pan') {
            this.viewport.panByScreenDelta(event.clientX - g.lastX, event.clientY - g.lastY);
          } else if (g.target && g.initial) {
            const nextPlan = structuredClone(interactionPlanSignal.value);
            const world = this.viewport.screenToWorld(event.clientX, event.clientY);
            const deltaX = world.x - g.startWorld.x;
            const deltaY = -(world.y - g.startWorld.y);
            if (g.hit.type === 'wall') {
              const nextX = Math.round(g.initial[0] + deltaX);
              const nextY = Math.round(g.initial[1] + deltaY);
              const wall = PlanService.wallIn(nextPlan, g.hit.wallId);
              if (wall) { wall.x = nextX; wall.y = nextY; }
            } else {
              const radians = -g.wallRotation * Math.PI / 180;
              const cos = Math.cos(radians), sin = Math.sin(radians);
              const localX = deltaX * cos - deltaY * sin;
              const localY = deltaX * sin + deltaY * cos;
              const nextX = Math.round(g.initial[0] + localX);
              const nextY = Math.round(g.initial[1] + localY);
              const wall = PlanService.wallIn(nextPlan, g.hit.wallId);
              const object = wall?.objects[g.hit.objectIndex] ||
                wall?.objects.find(candidate => candidate.name === g.hit.objectName);
              const outline = wall?.outline.points.map(([x, y]) => ({ x, y })) || [];
              const width = object?.width || 0;
              const height = object?.height || 0;
              if (object && GeometryTools.rectangleInsidePolygon(nextX, nextY, width, height, outline)) {
                object.x = nextX;
                object.y = nextY;
              }
            }
            interactionPlanSignal.value = nextPlan;
          }
          g.lastX = event.clientX;
          g.lastY = event.clientY;
        }
        pointerUp(event) {
          if (event.pointerType === 'touch' && this.touchPoints.has(event.pointerId)) {
            const wasPinching = !!this.pinch;
            this.touchPoints.delete(event.pointerId);
            if (wasPinching) {
              this.pinch = null;
              this.gesture = null;
              editorState.interactionPlan = null;
              this.element.classList.remove('dragging');
              if (this.element.hasPointerCapture(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
              return;
            }
          }
          const g = this.gesture;
          if (!g || event.pointerId !== g.pointerId) return;
          if (!g.moved) {
            interactionPlanSignal.value = null;
            this.selection.select(g.hit);
          } else if (g.mode === 'drag') {
            const wall = PlanService.wallIn(interactionPlanSignal.value, g.hit.wallId);
            const object = g.hit.type === 'object'
              ? (wall?.objects[g.hit.objectIndex] || wall?.objects.find(candidate => candidate.name === g.hit.objectName))
              : null;
            batch(() => {
              if (g.hit.type === 'wall' && wall) {
                this.planService.moveWall(g.hit.wallId, wall.x, wall.y);
              } else if (g.hit.type === 'object' && object) {
                this.planService.moveObject(
                  g.hit.wallId, g.hit.objectIndex, object.x, object.y,
                  g.hit.objectName
                );
              }
              editorState.interactionPlan = null;
            });
            this.selection.select(g.hit);
          } else {
            editorState.interactionPlan = null;
          }
          this.finish(event.pointerId);
        }
        pointerCancel(event) {
          if (event.pointerType === 'touch') {
            this.touchPoints.delete(event.pointerId);
            if (this.pinch && this.pinch.ids.includes(event.pointerId)) {
              this.pinch = null;
              this.gesture = null;
              this.element.classList.remove('dragging');
              return;
            }
          }
          const g = this.gesture;
          if (!g || event.pointerId !== g.pointerId) return;
          interactionPlanSignal.value = null;
          this.finish(event.pointerId);
        }
        finish(pointerId) {
          this.gesture = null;
          this.element.classList.remove('dragging');
          if (this.element.hasPointerCapture(pointerId)) this.element.releasePointerCapture(pointerId);
        }
      }

      const hitTester = new HitTester(() => effectivePlan.value);
      const selection = new Selection(editorState, ViewController.drawCanvas);
      const pointerController = new PointerController(preview, viewport, hitTester, selection, planService);
      preview.addEventListener('dblclick', event => {
        if (!event.target.closest('.zoom-controls')) ViewController.fitView();
      });
      document.getElementById('zoom-in').addEventListener('click', () => {
        const rect = preview.getBoundingClientRect();
        ViewController.zoomAt(1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
      });
      document.getElementById('zoom-out').addEventListener('click', () => {
        const rect = preview.getBoundingClientRect();
        ViewController.zoomAt(0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
      });
      document.getElementById('zoom-fit').addEventListener('click', ViewController.fitView);
      class Transform2D {
        static translation(element, attribute = 'transform') {
          const match = (element.getAttribute(attribute) || '').match(translateRe);
          return match ? [Number(match[1]), Number(match[2] || 0)] : [0, 0];
        }
        static setTranslation(element, x, y, attribute = 'transform') {
          const previous = element.getAttribute(attribute) || '';
          const remainder = previous.replace(translateRe, '').trim();
          element.setAttribute(attribute, `translate(${number(x)} ${number(y)})${remainder ? ' ' + remainder : ''}`);
        }
        static rotation(element, attribute = 'transform') {
          const match = (element.getAttribute(attribute) || '').match(/(?:^|\s)rotate\(\s*([+-]?(?:\d+\.?\d*|\.\d+))/);
          return match ? Number(match[1]) : 0;
        }
      }
      const translation = Transform2D.translation;
      const setTranslation = Transform2D.setTranslation;
      const rotation = Transform2D.rotation;
      class YamlCodec {
        static scalar(value) { const t=String(value??''); return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(t)?t:JSON.stringify(t); }
        static encode(planInput = null) {
          const plan=planInput || planService.snapshot();
          const lines=['format: tiling-plan','upAxis3d: z',`name: ${YamlCodec.scalar(plan.name)}`,'patterns:'];
          lines.splice(lines.length-1,0,plan.lights3d.length?'lights3d:':'lights3d: []',...plan.lights3d.flatMap(light=>['  - id: '+YamlCodec.scalar(light.id),...Object.entries(light).filter(([key])=>key!=='id').map(([key,value])=>'    '+key+': '+(typeof value==='string'?YamlCodec.scalar(value):number(value)))]));
          for(const p of plan.patterns) lines.push(`  - name: ${YamlCodec.scalar(p.name)}`,`    tileWidth: ${number(p.tileWidth)}`,`    tileHeight: ${number(p.tileHeight)}`,`    borderSize: ${number(p.borderSize)}`,`    tileColor: ${YamlCodec.scalar(p.tileColor)}`,`    borderColor: ${YamlCodec.scalar(p.borderColor)}`,`    tileTexture: ${YamlCodec.scalar(p.tileTexture||'')}`,`    randomTextureRotation: ${p.randomTextureRotation?'true':'false'}`);
          lines.push('walls:');
          for(const w of plan.walls){
            lines.push(`  - name: ${YamlCodec.scalar(w.name)}`,`    x: ${number(w.x)}`,`    y: ${number(w.y)}`,`    rotation: ${number(w.rotation)}`,'    outline:',`      points: ${JSON.stringify(w.outline.points.map(p=>`${number(p[0])},${number(p[1])}`).join(' '))}`);
            if(w.placement3d) { lines.splice(lines.length-2,0,'    placement3d:',...Object.entries(w.placement3d).map(([key,value])=>'      '+key+': '+(typeof value==='string'?YamlCodec.scalar(value):number(value)))); }
            if(w.outline.pattern) lines.push(`      pattern: ${YamlCodec.scalar(w.outline.pattern)}`,`      patternX: ${number(w.outline.patternX)}`,`      patternY: ${number(w.outline.patternY)}`,`      patternRotation: ${number(w.outline.patternRotation||0)}`);
            if(w.patternRegions?.length){ lines.push('    patternRegions:'); for(const r of w.patternRegions) lines.push(`      - x: ${number(r.x)}`,`        y: ${number(r.y)}`,`        width: ${number(r.width)}`,`        height: ${number(r.height)}`,`        pattern: ${YamlCodec.scalar(r.pattern)}`,`        patternX: ${number(r.patternX)}`,`        patternY: ${number(r.patternY)}`,`        patternRotation: ${number(r.patternRotation||0)}`); }
            if(w.objects.length) { lines.push('    objects:'); for(const o of w.objects) lines.push(`      - name: ${YamlCodec.scalar(o.name||'element')}`,`        x: ${number(o.x)}`,`        y: ${number(o.y)}`,`        width: ${number(o.width)}`,`        height: ${number(o.height)}`,`        fill: ${YamlCodec.scalar(o.fill||'red')}`,`        depth: ${number(o.depth||10)}`); }
          }
          return lines.join('\n');
        }
        static parseScalar(raw){const v=raw.trim();if(!v)return '';if(v.startsWith('"')&&v.endsWith('"')){try{return JSON.parse(v)}catch{}}if(v.startsWith("'")&&v.endsWith("'"))return v.slice(1,-1);if(/^-?(?:\d+\.?\d*|\.\d+)$/.test(v))return Number(v);if(v==='true')return true;if(v==='false')return false;if(v==='null')return null;return v;}
        static decode(text){
          const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n'); const raw={patterns:[],walls:[]}; let section='',item=null,sub='';
          for(const line of lines){if(!line.trim()||line.trim().startsWith('#'))continue;const indent=(line.match(/^\s*/)||[''])[0].length,t=line.trim();
            if(indent===0){const m=t.match(/^([^:]+):\s*(.*)$/);if(!m)continue;const k=m[1],v=m[2];if(['canvas','patterns','walls','light3d','lights3d'].includes(k)){section=k;item=null;sub='';if(k==='lights3d')raw.lights3d=[];}else raw[k]=YamlCodec.parseScalar(v);continue;}
            if(section==='lights3d'){if(t.startsWith('- ')){item={};raw.lights3d.push(item);const m=t.slice(2).match(/^([^:]+):\s*(.*)$/);if(m)item[m[1]]=YamlCodec.parseScalar(m[2]);}else{const m=t.match(/^([^:]+):\s*(.*)$/);if(m&&item)item[m[1]]=YamlCodec.parseScalar(m[2]);}continue;}
            if(section==='light3d'){raw.light3d ||= {};const m=t.match(/^([^:]+):\s*(.*)$/);if(m)raw.light3d[m[1]]=YamlCodec.parseScalar(m[2]);continue;}
            if(section==='canvas') continue;
            if(section==='patterns'){if(t.startsWith('- ')){item={};raw.patterns.push(item);const m=t.slice(2).match(/^([^:]+):\s*(.*)$/);if(m)item[m[1]]=YamlCodec.parseScalar(m[2]);}else{const m=t.match(/^([^:]+):\s*(.*)$/);if(m&&item)item[m[1]]=YamlCodec.parseScalar(m[2]);}continue;}
            if(section==='walls'){if(indent===2&&t.startsWith('- ')){item={outline:{},objects:[]};raw.walls.push(item);sub='';const m=t.slice(2).match(/^([^:]+):\s*(.*)$/);if(m)item[m[1]]=YamlCodec.parseScalar(m[2]);continue;}if(!item)continue;if(indent===4&&t==='placement3d:'){sub='placement3d';item.placement3d={};continue;}if(indent===4&&t==='outline:'){sub='outline';continue;}if(indent===4&&(t==='objects:'||t==='objects: []')){sub='objects';continue;}if(indent===4&&(t==='patternRegions:'||t==='patternRegions: []')){sub='patternRegions';item.patternRegions=[];continue;}if(indent===4){const m=t.match(/^([^:]+):\s*(.*)$/);if(m)item[m[1]]=YamlCodec.parseScalar(m[2]);continue;}if(sub==='placement3d'&&indent>=6){const m=t.match(/^([^:]+):\s*(.*)$/);if(m)item.placement3d[m[1]]=YamlCodec.parseScalar(m[2]);continue;}if(sub==='outline'&&indent>=6){const m=t.match(/^([^:]+):\s*(.*)$/);if(m)item.outline[m[1]]=YamlCodec.parseScalar(m[2]);continue;}if(sub==='patternRegions'&&indent===6&&t.startsWith('- ')){const r={};item.patternRegions.push(r);const m=t.slice(2).match(/^([^:]+):\s*(.*)$/);if(m)r[m[1]]=YamlCodec.parseScalar(m[2]);continue;}if(sub==='patternRegions'&&indent>=8&&item.patternRegions.length){const m=t.match(/^([^:]+):\s*(.*)$/);if(m)item.patternRegions[item.patternRegions.length-1][m[1]]=YamlCodec.parseScalar(m[2]);continue;}if(sub==='objects'&&indent===6&&t.startsWith('- ')){const o={};item.objects.push(o);const m=t.slice(2).match(/^([^:]+):\s*(.*)$/);if(m)o[m[1]]=YamlCodec.parseScalar(m[2]);continue;}if(sub==='objects'&&indent>=8&&item.objects.length){const m=t.match(/^([^:]+):\s*(.*)$/);if(m)item.objects[item.objects.length - 1][m[1]]=YamlCodec.parseScalar(m[2]);}}
          }
          if(!raw.walls.length)throw new Error('Expected at least one wall.');
          for(const w of raw.walls){const text=String(w.outline?.points||'').trim();w.outline.points=text?text.split(/\s+/).map(pair=>pair.split(',').map(Number)).filter(p=>p.length===2&&p.every(Number.isFinite)):[];}
          return PlanService.normalizeData(raw);
        }
      }
      class SvgCodec {
        static formatXml(xmlText) {
          const tokens=xmlText.replace(/>\s*</g,'><').trim().replace(/</g,'\n<').trim().split('\n'); let depth=0; const lines=[];
          for(const raw of tokens){const token=raw.trim();if(!token)continue;if(/^<\//.test(token))depth=Math.max(0,depth-1);lines.push('  '.repeat(depth)+token);if(/^<[^!?/][^>]*>$/.test(token)&&!(/\/>$/.test(token))&&!/^<[^>]+>.*<\//.test(token))depth++;}
          return lines.join('\n');
        }
        static decode(input) {
          const root=typeof input==='string'?new DOMParser().parseFromString(input,'image/svg+xml').documentElement:input;
          if(!root||root.localName!=='svg'||root.querySelector('parsererror'))throw new Error('Invalid SVG plan.');
          if(root.querySelector('script, foreignObject')||[...root.querySelectorAll('*')].some(el=>[...el.attributes].some(a=>/^on/i.test(a.name))))throw new Error('Scripts and inline event handlers are not allowed.');
          const numeric=(v,f=0)=>{const n=Number.parseFloat(String(v??''));return Number.isFinite(n)?n:f;};
          const parsePoints=v=>String(v??'').trim().split(/\s+/).filter(Boolean).map(pair=>pair.split(',').map(Number)).filter(p=>p.length===2&&p.every(Number.isFinite));
          const byId=id=>[...root.querySelectorAll('[id]')].find(n=>n.id===id)||null;
          const vb=(root.getAttribute('viewBox')||'0 0 0 0').trim().split(/[\s,]+/).map(Number); if(vb.length!==4||vb.some(n=>!Number.isFinite(n))||vb[2]<=0||vb[3]<=0)throw new Error('SVG needs a valid viewBox.');
          const flipped=root.querySelector('#flipped-drawing'); const [,fy]=flipped?Transform2D.translation(flipped):[0,NaN];
          const allPatterns=[...root.querySelectorAll('pattern[id]')];
          const definitions=allPatterns.filter(p=>p.id==='tile-pattern'||p.hasAttribute('data-tile-definition')||p.querySelector(':scope > rect[data-tile]')||(!p.getAttribute('href')&&!p.getAttribute('xlink:href')&&p.querySelector(':scope > rect')));
          const patterns=definitions.map(p=>{const tile=p.querySelector(':scope > rect[data-tile]')||p.querySelector(':scope > rect');const background=p.querySelector(':scope > rect[data-border]');const tileWidth=numeric(tile?.getAttribute('width'));const tileHeight=numeric(tile?.getAttribute('height'));const repeatCols=Math.max(1,numeric(p.getAttribute('data-repeat-cols'),1));const repeatRows=Math.max(1,numeric(p.getAttribute('data-repeat-rows'),1));const patternWidth=numeric(p.getAttribute('width'),tileWidth)/repeatCols;const patternHeight=numeric(p.getAttribute('height'),tileHeight)/repeatRows;const widthGap=Math.max(0,patternWidth-tileWidth);const borderSize=widthGap;const texture=p.querySelector(':scope > image[data-tile-texture]');return{name:p.id,tileWidth,tileHeight,borderSize,tileColor:tile?.getAttribute('fill')||'#ffffff',borderColor:background?.getAttribute('fill')||tile?.getAttribute('stroke')||'#888888',tileTexture:texture?.getAttribute('href')||texture?.getAttribute('xlink:href')||'',randomTextureRotation:p.getAttribute('data-random-texture-rotation')==='true'};});
          const walls=[...root.querySelectorAll('g.wall')].map(w=>{const [x,y]=Transform2D.translation(w),outline=w.querySelector(':scope > polygon.outline');const fill=outline?.getAttribute('fill')||'';const m=fill.match(/^url\(#(.+)\)$/);const ref=m?.[1]||outline?.getAttribute('data-pattern-ref')||'';const wrapper=ref?byId(ref):null;const href=wrapper?.getAttribute('href')||wrapper?.getAttribute('xlink:href')||'';const pattern=href.startsWith('#')?href.slice(1):(definitions.some(p=>p.id===ref)?ref:'');const [patternX,patternY]=wrapper?Transform2D.translation(wrapper,'patternTransform'):[0,0];const patternRotation=wrapper?Transform2D.rotation(wrapper,'patternTransform'):0;return{name:w.id||w.getAttribute('name')||'',x,y,rotation:Transform2D.rotation(w),placement3d:(()=>{try{return JSON.parse(w.getAttribute('data-placement-3d')||'null');}catch{return null;}})(),outline:{points:parsePoints(outline?.getAttribute('points')),pattern,patternX,patternY,patternRotation,fill:pattern?'white':(outline?.getAttribute('fill')||'white'),stroke:outline?.getAttribute('stroke')||'',strokeWidth:numeric(outline?.getAttribute('stroke-width'),1)},objects:[...w.querySelectorAll(':scope > rect.obj')].map(o=>{const [tx,ty]=Transform2D.translation(o);return{name:o.getAttribute('name')||'',x:numeric(o.getAttribute('x'))+tx,y:numeric(o.getAttribute('y'))+ty,width:numeric(o.getAttribute('width')),height:numeric(o.getAttribute('height')),depth:numeric(o.getAttribute('data-depth'),10),fill:o.getAttribute('fill')||''};})};});
          return PlanService.normalizeData({upAxis3d:root.getAttribute('data-up-axis-3d'),lights3d:(()=>{try{return JSON.parse(root.getAttribute('data-lights-3d')||'null');}catch{return null;}})(),light3d:(()=>{try{return JSON.parse(root.getAttribute('data-light-3d')||'null');}catch{return null;}})(),name:root.getAttribute('data-plan-name')||root.querySelector(':scope > title')?.textContent?.trim()||'Tiling plan',units:'mm',patterns,walls});
        }

        static encode(planInput) {
          const plan=planInput,canvas=PlanService.canvasFromWalls(plan.walls),ns='http://www.w3.org/2000/svg',doc=document.implementation.createDocument(ns,'svg',null),svg=doc.documentElement;
          svg.setAttributeNS('http://www.w3.org/2000/xmlns/','xmlns',ns);svg.setAttribute('data-up-axis-3d','z');svg.setAttribute('data-lights-3d',JSON.stringify(plan.lights3d));svg.setAttribute('data-plan-name',plan.name);svg.setAttribute('viewBox',[canvas.x,canvas.y,canvas.width,canvas.height].map(number).join(' '));svg.setAttribute('width',`${number(canvas.width)}${plan.units}`);svg.setAttribute('height',`${number(canvas.height)}${plan.units}`);
          const defs=doc.createElementNS(ns,'defs');svg.append(defs);
          for(const p of plan.patterns){const cellWidth=p.tileWidth+p.borderSize,cellHeight=p.tileHeight+p.borderSize;const repeat=p.tileTexture&&p.randomTextureRotation?4:1;const patternWidth=cellWidth*repeat,patternHeight=cellHeight*repeat;const pat=doc.createElementNS(ns,'pattern');pat.id=p.name;pat.setAttribute('width',number(patternWidth));pat.setAttribute('height',number(patternHeight));pat.setAttribute('patternUnits','userSpaceOnUse');if(p.name!=='tile-pattern')pat.setAttribute('data-tile-definition','true');if(repeat>1){pat.setAttribute('data-repeat-cols',String(repeat));pat.setAttribute('data-repeat-rows',String(repeat));pat.setAttribute('data-random-texture-rotation','true');}const border=doc.createElementNS(ns,'rect');border.setAttribute('data-border','true');border.setAttribute('x','0');border.setAttribute('y','0');border.setAttribute('width',number(patternWidth));border.setAttribute('height',number(patternHeight));border.setAttribute('fill',p.borderColor||'#888888');pat.append(border);for(let row=0;row<repeat;row++){for(let col=0;col<repeat;col++){const x=col*cellWidth,y=row*cellHeight;const tile=doc.createElementNS(ns,'rect');tile.setAttribute('data-tile','true');tile.setAttribute('x',number(x));tile.setAttribute('y',number(y));tile.setAttribute('width',number(p.tileWidth));tile.setAttribute('height',number(p.tileHeight));tile.setAttribute('fill',p.tileColor||'#ffffff');pat.append(tile);if(p.tileTexture){const image=doc.createElementNS(ns,'image');image.setAttribute('data-tile-texture','true');const rotation=p.randomTextureRotation?textureRotationQuarter(col,row):0;const quarter=rotation%2;const drawWidth=quarter?p.tileHeight:p.tileWidth,drawHeight=quarter?p.tileWidth:p.tileHeight;image.setAttribute('x',number(-drawWidth/2));image.setAttribute('y',number(-drawHeight/2));image.setAttribute('width',number(drawWidth));image.setAttribute('height',number(drawHeight));image.setAttribute('preserveAspectRatio','none');image.setAttribute('href',p.tileTexture);image.setAttribute('transform',`translate(${number(x+p.tileWidth/2)} ${number(y+p.tileHeight/2)}) rotate(${rotation*90})`);pat.append(image);}}}defs.append(pat);}
          const drawing=doc.createElementNS(ns,'g');drawing.id='flipped-drawing';drawing.setAttribute('transform',`translate(0 ${number(canvas.flipY)}) scale(1 -1)`);svg.append(drawing);
          for(const w of plan.walls){const g=doc.createElementNS(ns,'g');g.id=w.name;if(w.placement3d)g.setAttribute('data-placement-3d',JSON.stringify(w.placement3d));g.setAttribute('class','wall');g.setAttribute('transform',`translate(${number(w.x)} ${number(w.y)}) rotate(${number(w.rotation)})`);const poly=doc.createElementNS(ns,'polygon');poly.setAttribute('class','outline');poly.setAttribute('points',w.outline.points.map(p=>`${number(p[0])},${number(p[1])}`).join(' '));if(w.outline.pattern){let pid=`${w.name}-tile-pattern`,n=2;while([...defs.querySelectorAll('pattern[id]')].some(p=>p.id===pid))pid=`${w.name}-tile-pattern-${n++}`;const wrap=doc.createElementNS(ns,'pattern');wrap.id=pid;wrap.setAttribute('href',`#${w.outline.pattern}`);wrap.setAttribute('patternTransform',`translate(${number(w.outline.patternX)} ${number(w.outline.patternY)}) rotate(${number(w.outline.patternRotation||0)})`);defs.append(wrap);poly.setAttribute('fill',`url(#${pid})`);}else poly.setAttribute('fill',w.outline.fill||'white');if(w.outline.stroke)poly.setAttribute('stroke',w.outline.stroke);poly.setAttribute('stroke-width',number(w.outline.strokeWidth));g.append(poly);for(const o of w.objects){const r=doc.createElementNS(ns,'rect');r.setAttribute('class','obj');r.setAttribute('data-depth',number(o.depth||10));r.setAttribute('name',o.name);r.setAttribute('x','0');r.setAttribute('y','0');r.setAttribute('transform',`translate(${number(o.x)} ${number(o.y)})`);r.setAttribute('width',number(o.width));r.setAttribute('height',number(o.height));r.setAttribute('fill',o.fill||'red');r.setAttribute('fill-opacity','0.2');g.append(r);}drawing.append(g);}
          return SvgCodec.formatXml(serializer.serializeToString(svg));
        }
        static snapshot(planInput) {
          const plan = planInput;
          return {
            name: plan.name,
            lights3d: plan.lights3d.map(light=>({...light})),
            units: plan.units,
            canvas: { ...plan.canvas },
            patterns: plan.patterns.map(pattern => ({ ...pattern })),
            walls: plan.walls.map(wall => ({
              name: wall.name, x: wall.x, y: wall.y, rotation: wall.rotation, placement3d:wall.placement3d,
              outline: {
                ...wall.outline,
                points: wall.outline.points.map(point => [...point])
              },
              objects: wall.objects.map(object => ({ ...object }))
            }))
          };
        }

        static validateRoundTrip(input) {
          const first = SvgCodec.decode(input);
          const encoded = SvgCodec.encode(first);
          const second = SvgCodec.decode(encoded);
          const before = SvgCodec.snapshot(first);
          const after = SvgCodec.snapshot(second);
          const equal = JSON.stringify(before) === JSON.stringify(after);
          return { equal, before, after, encoded };
        }
      }
      let resetSnapshot = planService.snapshot();
      baseBox = planService.data.canvas.width > 0 && planService.data.canvas.height > 0
        ? [planService.data.canvas.x, planService.data.canvas.y, planService.data.canvas.width, planService.data.canvas.height]
        : [...EMPTY_VIEW_BOX];
      view.box = [...baseBox];

      source.addEventListener('scroll', () => {
        highlight.scrollTop = source.scrollTop;
        highlight.scrollLeft = source.scrollLeft;
      });
      const textureRotationQuarter = (column, row) => {
        let hash = Math.imul(column | 0, 0x45d9f3b) ^ Math.imul(row | 0, 0x119de1f3);
        hash ^= hash >>> 16;
        return hash & 3;
      };
      const tileTextureCache = new Map();
      const tileTextureImage = source => {
        if (!source) return null;
        if (tileTextureCache.has(source)) return tileTextureCache.get(source);
        const image = new Image();
        tileTextureCache.set(source, image);
        image.onload = () => {ViewController.drawCanvas();threePreview.textureRevision++;threePreview.request();};
        image.onerror = ViewController.drawCanvas;
        image.src = source;
        return image;
      };

      function paintSurfacePattern(ctx,path,outline,patterns,visibleBounds,scale,dpr) {
            const definition = outline.pattern ? patterns.get(outline.pattern) : null;
            ctx.save();
            ctx.clip(path);
            ctx.fillStyle = definition?.borderColor || outline.fill || 'white';
            ctx.fill(path);
            if (definition && definition.tileWidth + definition.borderSize > 0 && definition.tileHeight + definition.borderSize > 0) {
              const patternWidth = definition.tileWidth + definition.borderSize;
              const patternHeight = definition.tileHeight + definition.borderSize;
              const bounds = outline.points;
              if (bounds.length) {
                const xs = bounds.map(point => point[0]), ys = bounds.map(point => point[1]);
                const wallMinX = Math.min(...xs), wallMaxX = Math.max(...xs), wallMinY = Math.min(...ys), wallMaxY = Math.max(...ys);
                const minX = Math.max(wallMinX, visibleBounds?.minX ?? wallMinX);
                const maxX = Math.min(wallMaxX, visibleBounds?.maxX ?? wallMaxX);
                const minY = Math.max(wallMinY, visibleBounds?.minY ?? wallMinY);
                const maxY = Math.min(wallMaxY, visibleBounds?.maxY ?? wallMaxY);
                if (minX <= maxX && minY <= maxY) {
                  const offsetX = outline.patternX || 0, offsetY = outline.patternY || 0;
                  const angle = (outline.patternRotation || 0) * Math.PI / 180;
                  const cosine = Math.cos(angle), sine = Math.sin(angle);
                  const corners = [[minX,minY],[minX,maxY],[maxX,minY],[maxX,maxY]].map(([x,y]) => {
                    const dx=x-offsetX, dy=y-offsetY;
                    return [dx*cosine+dy*sine,-dx*sine+dy*cosine];
                  });
                  const gridMinX=Math.min(...corners.map(p=>p[0])), gridMaxX=Math.max(...corners.map(p=>p[0]));
                  const gridMinY=Math.min(...corners.map(p=>p[1])), gridMaxY=Math.max(...corners.map(p=>p[1]));
                  ctx.translate(offsetX,offsetY);
                  if (angle) ctx.rotate(angle);
                  ctx.fillStyle = definition.tileColor || '#ffffff';
                  const seamOverlap = definition.borderSize === 0 ? 1 / (scale * dpr) : 0;
                  let x = Math.floor(gridMinX / patternWidth) * patternWidth;
                  for (; x <= gridMaxX + patternWidth; x += patternWidth) {
                    let y = Math.floor(gridMinY / patternHeight) * patternHeight;
                    for (; y <= gridMaxY + patternHeight; y += patternHeight) {
                      const texture = tileTextureImage(definition.tileTexture);
                      if (texture?.complete && texture.naturalWidth > 0) {
                        const column = Math.round(x / patternWidth);
                        const row = Math.round(y / patternHeight);
                        const rotation = definition.randomTextureRotation ? textureRotationQuarter(column, row) : 0;
                        const quarter = rotation % 2;
                        const drawWidth = (quarter ? definition.tileHeight : definition.tileWidth) + seamOverlap;
                        const drawHeight = (quarter ? definition.tileWidth : definition.tileHeight) + seamOverlap;
                        ctx.save();
                        ctx.translate(x + definition.tileWidth / 2, y + definition.tileHeight / 2);
                        ctx.rotate(rotation * Math.PI / 2);
                        ctx.drawImage(texture, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
                        ctx.restore();
                      } else ctx.fillRect(x, y, definition.tileWidth + seamOverlap, definition.tileHeight + seamOverlap);
                    }
                  }
                }
              }
            }
            ctx.restore();
          }

      class CanvasRenderer {
        static paint(planInput) {
          const plan = planInput;
          const rect = stage.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const dpr = window.devicePixelRatio || 1;
          const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
          const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
          if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';
          }

          const metrics = viewport.metrics();
          const scale = metrics.scale;
          const box = view.box;
          const flipY = plan.canvas.flipY;
          const patterns = new Map(plan.patterns.map(pattern => [pattern.name, pattern]));

          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, rect.width, rect.height);
          ctx.save();
          ctx.translate(metrics.left, metrics.top);
          ctx.scale(scale, scale);
          ctx.translate(-box[0], -box[1]);
          ctx.translate(0, flipY);
          ctx.scale(1, -1);

          const polygonPath = points => {
            const path = new Path2D();
            if (!points.length) return path;
            path.moveTo(points[0][0], points[0][1]);
            for (let i = 1; i < points.length; i++) path.lineTo(points[i][0], points[i][1]);
            path.closePath();
            return path;
          };
          const visiblePlanCorners = [
            [box[0] + (0 - metrics.left) / scale, flipY - box[1] - (0 - metrics.top) / scale],
            [box[0] + (rect.width - metrics.left) / scale, flipY - box[1] - (0 - metrics.top) / scale],
            [box[0] + (rect.width - metrics.left) / scale, flipY - box[1] - (rect.height - metrics.top) / scale],
            [box[0] + (0 - metrics.left) / scale, flipY - box[1] - (rect.height - metrics.top) / scale]
          ];
          const visibleBoundsInWall = (wx, wy, angle) => {
            const c = Math.cos(angle), s = Math.sin(angle);
            const local = visiblePlanCorners.map(([x, y]) => {
              const dx = x - wx, dy = y - wy;
              return [dx * c + dy * s, -dx * s + dy * c];
            });
            const xs = local.map(point => point[0]), ys = local.map(point => point[1]);
            return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
          };
          const drawPattern=(path,outline,visibleBounds)=>paintSurfacePattern(ctx,path,outline,patterns,visibleBounds,scale,dpr);

          for (const wall of plan.walls) {
            const angle = wall.rotation * Math.PI / 180;
            if (!wall.outline.points.length) continue;
            ctx.save();
            ctx.translate(wall.x, wall.y);
            if (angle) ctx.rotate(angle);
            const path = polygonPath(wall.outline.points);
            drawPattern(path, wall.outline, visibleBoundsInWall(wall.x, wall.y, angle));
            for (const region of wall.patternRegions || []) {
              if (!(region.width > 0 && region.height > 0) || !region.pattern) continue;
              const regionPath = new Path2D();
              regionPath.rect(region.x, region.y, region.width, region.height);
              const regionOutline = { points:[[region.x,region.y],[region.x+region.width,region.y],[region.x+region.width,region.y+region.height],[region.x,region.y+region.height]], pattern:region.pattern, patternX:region.patternX, patternY:region.patternY, patternRotation:region.patternRotation, fill:'transparent' };
              ctx.save();
              ctx.clip(path);
              drawPattern(regionPath, regionOutline, visibleBoundsInWall(wall.x, wall.y, angle));
              ctx.restore();
            }
            if (wall.outline.stroke && wall.outline.stroke !== 'none') {
              ctx.strokeStyle = wall.outline.stroke;
              ctx.lineWidth = wall.outline.strokeWidth || 1;
              ctx.stroke(path);
            }
            for (const object of wall.objects) {
              if (![object.x, object.y, object.width, object.height].every(Number.isFinite)) continue;
              ctx.globalAlpha = 0.2;
              ctx.fillStyle = object.fill || 'red';
              ctx.fillRect(object.x, object.y, object.width, object.height);
              ctx.globalAlpha = 1;
            }
            ctx.restore();
          }
          ctx.restore();

          const localToScreen = (wall, x, y) => {
            const angle = wall.rotation * Math.PI / 180;
            const cos = Math.cos(angle), sin = Math.sin(angle);
            const planX = wall.x + x * cos - y * sin;
            const planY = wall.y + x * sin + y * cos;
            return {
              x: metrics.left + (planX - box[0]) * scale,
              y: metrics.top + ((flipY - planY) - box[1]) * scale
            };
          };
          const paintText = (text, x, y, fontPx, weight) => {
            ctx.save();
            ctx.font = `${weight} ${fontPx}px Inter, Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'white';
            ctx.strokeText(text, x, y);
            ctx.fillStyle = '#192625';
            ctx.fillText(text, x, y);
            ctx.restore();
          };
          if (!plan.walls.length) {
            ctx.save();
            ctx.font = '600 16px Inter, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#6b7280';
            ctx.fillText(
              'Upload your plan or load the template',
              metrics.left + metrics.width / 2,
              metrics.top + metrics.height / 2
            );
            ctx.restore();
          }

          for (const wall of plan.walls) {
            wall.objects.forEach((object, index) => {
              const center = localToScreen(wall, object.x + object.width / 2, object.y + object.height / 2);
              if (showLabels.checked) paintText(object.name || 'element', center.x, center.y - (showDimensions.checked ? 7 : 0), 16, 700);
              if (showDimensions.checked) paintText(`${number(object.width)} × ${number(object.height)} mm`, center.x, center.y + (showLabels.checked ? 8 : 0), 10, 600);
              const selected = wall.name === editorState.selectedWallId && editorState.selectedObjectName && (
                (Number.isInteger(editorState.selectedObjectIndex) && index === editorState.selectedObjectIndex) ||
                (!Number.isInteger(editorState.selectedObjectIndex) && object.name === editorState.selectedObjectName)
              );
              if (selected) {
                ctx.beginPath();
                ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#192625';
                ctx.fill();
              }
            });
            if (wall.name === editorState.selectedWallId && !editorState.selectedObjectName && wall.outline.points.length) {
              const xs = wall.outline.points.map(point => point[0]);
              const ys = wall.outline.points.map(point => point[1]);
              const center = localToScreen(wall, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
              ctx.beginPath();
              ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
              ctx.fillStyle = '#192625';
              ctx.fill();
            }
          }
        }

        render() {
          ViewController.drawCanvas();
          zoomLevel.textContent = Math.round(view.scale * 100) + '%';
        }
      }

      class ObjectLayers {
        static offsets(objects) {
          const offsets=new Map(),placed=[];
          // Larger rectangles are containers. Area ordering handles nested
          // elements regardless of their order in the model and prevents cycles.
          const ordered=objects.map((object,index)=>({object,index})).filter(({object:o})=>o.width>0&&o.height>0)
            .sort((a,b)=>b.object.width*b.object.height-a.object.width*a.object.height || a.index-b.index);
          for(const {object:o,index} of ordered) {
            let base=.003;
            for(const prior of placed) {
              const p=prior.object;
              const overlaps=o.x<p.x+p.width && o.x+o.width>p.x && o.y<p.y+p.height && o.y+o.height>p.y;
              if(overlaps)base=Math.max(base,prior.front+.003);
            }
            offsets.set(index,base);placed.push({object:o,front:base+(o.depth||10)/1000});
          }
          return offsets;
        }
      }
      class ThreePreview {
        constructor(container) {
          this.container=container;this.entries=new Map();this.lights=new Map();this.pending=false;this.loading=false;
          this.textureRevision=0;this.needsFit=true;this.pointerStart=null;
          document.getElementById('three-light-toggle').onchange=event=>{lightVisibleSignal.value=event.currentTarget.checked;};
          document.getElementById('three-fit').onclick=()=>{this.fit();this.render();};
          for(const name of ['perspective','top','front'])document.getElementById('three-'+name).onclick=()=>{this.fit(name);this.render();};
          new ResizeObserver(()=>this.request()).observe(container);
        }
        async activate() {
          if(this.renderer){this.request();return;}
          if(this.loading)return;
          this.loading=true;
          const status=document.getElementById('three-status');status.textContent='Preparing 3D preview…';
          try {
            const [THREE,{OrbitControls}]=await Promise.all([import('three'),import('three/addons/controls/OrbitControls.js')]);
            this.THREE=THREE;
            this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
            this.renderer.outputColorSpace=THREE.SRGBColorSpace;
            this.container.insertBefore(this.renderer.domElement,this.container.firstChild);
            this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#eaf0ed');
            this.camera=new THREE.PerspectiveCamera(45,1,.01,1000);this.camera.up.set(0,0,1);this.camera.position.set(6,-6,5);
            this.controls=new OrbitControls(this.camera,this.renderer.domElement);
            this.controls.enableDamping=false;this.controls.maxPolarAngle=Math.PI*.98;
            this.controls.addEventListener('change',()=>this.render());
            const sky=new THREE.HemisphereLight(0xffffff,0x778579,2.1);sky.position.set(0,0,1);this.scene.add(sky);
            this.grid=new THREE.GridHelper(20,40,0x9ab3a6,0xc8d7cf);this.grid.rotation.x=Math.PI/2;this.grid.position.z=-.025;this.scene.add(this.grid);
            const element=this.renderer.domElement;
            element.addEventListener('pointerdown',e=>{this.pointerStart={id:e.pointerId,x:e.clientX,y:e.clientY,button:e.button,multiple:!e.isPrimary};});
            element.addEventListener('pointerup',e=>{const start=this.pointerStart;this.pointerStart=null;if(start&&start.id===e.pointerId&&!start.multiple&&start.button===0&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<5)this.pick(e);});
            element.addEventListener('pointercancel',()=>{this.pointerStart=null;});
            element.addEventListener('webglcontextlost',e=>{e.preventDefault();status.textContent='3D graphics context was lost. Reload the editor to restore it.';});
            status.textContent='Drag to orbit · Shift-drag / right-drag to pan · scroll or pinch to zoom · click to select';
            this.loading=false;this.request();
          } catch(error) {
            this.renderer?.dispose();this.renderer=null;this.loading=false;
            status.textContent='3D preview needs WebGL 2 in your browser. The 2D editor is available. '+error.message;
          }
        }
        request() {
          if(this.pending)return;this.pending=true;
          requestAnimationFrame(()=>{this.pending=false;if(!this.renderer||this.container.hidden)return;this.update(effectivePlan.value);});
        }
        dispose(entry) {
          this.scene.remove(entry.group);
          entry.group.traverse(node=>{node.geometry?.dispose();const materials=Array.isArray(node.material)?node.material:[node.material];for(const material of materials){if(material){material.map?.dispose();material.dispose();}}});
        }
        bake(wall,plan,bounds) {
          const THREE=this.THREE;
          const canvas=document.createElement('canvas');
          const size=Math.max(bounds.width,bounds.height,1),resolution=Math.min(2048,this.renderer.capabilities.maxTextureSize)/size;
          canvas.width=Math.max(1,Math.ceil(bounds.width*resolution));canvas.height=Math.max(1,Math.ceil(bounds.height*resolution));
          const ctx=canvas.getContext('2d');ctx.setTransform(resolution,0,0,-resolution,-bounds.minX*resolution,bounds.maxY*resolution);
          const points=wall.outline.points,path=new Path2D();path.moveTo(...points[0]);for(const point of points.slice(1))path.lineTo(...point);path.closePath();
          const patterns=new Map(plan.patterns.map(p=>[p.name,p]));
          paintSurfacePattern(ctx,path,wall.outline,patterns,null,resolution,1);
          for(const region of wall.patternRegions||[]){
            if(!region.pattern||!(region.width>0&&region.height>0))continue;
            const regionPath=new Path2D();regionPath.rect(region.x,region.y,region.width,region.height);
            const outline={...region,points:[[region.x,region.y],[region.x+region.width,region.y],[region.x+region.width,region.y+region.height],[region.x,region.y+region.height]]};
            ctx.save();ctx.clip(path);paintSurfacePattern(ctx,regionPath,outline,patterns,null,resolution,1);ctx.restore();
          }
          const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
          return texture;
        }
        build(wall,plan) {
          const THREE=this.THREE,points=wall.outline.points;
          const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
          const bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
          bounds.width=Math.max(1,bounds.maxX-bounds.minX);bounds.height=Math.max(1,bounds.maxY-bounds.minY);
          const shape=new THREE.Shape();shape.moveTo(points[0][0]/1000,points[0][1]/1000);for(const p of points.slice(1))shape.lineTo(p[0]/1000,p[1]/1000);shape.closePath();
          const geometry=new THREE.ShapeGeometry(shape),vertices=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
          for(let i=0;i<vertices.count;i++)uv.setXY(i,(vertices.getX(i)*1000-bounds.minX)/bounds.width,(vertices.getY(i)*1000-bounds.minY)/bounds.height);
          uv.needsUpdate=true;
          const material=new THREE.MeshStandardMaterial({map:this.bake(wall,plan,bounds),side:THREE.FrontSide,roughness:.83});
          const mesh=new THREE.Mesh(geometry,material);mesh.userData={type:'wall',wallId:wall.name};
          const backMesh=new THREE.Mesh(geometry.clone(),new THREE.MeshStandardMaterial({color:0xffffff,side:THREE.BackSide,roughness:.83}));backMesh.userData={type:'wall',wallId:wall.name};
          const frame=new THREE.Group(),surface=new THREE.Group();frame.add(surface);surface.add(mesh,backMesh);
          const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0x6c8175}));edges.position.z=.002;surface.add(edges);
          const offsets=ObjectLayers.offsets(wall.objects);
          wall.objects.forEach((o,index)=>{
            if(!(o.width>0&&o.height>0))return;
            const box=new THREE.Mesh(new THREE.BoxGeometry(o.width/1000,o.height/1000,(o.depth||10)/1000),new THREE.MeshStandardMaterial({color:o.fill||'#9aada3',roughness:.72}));
            box.position.set((o.x+o.width/2)/1000,(o.y+o.height/2)/1000,(o.depth||10)/2000+offsets.get(index));
            box.userData={type:'object',wallId:wall.name,objectName:o.name,objectIndex:index};surface.add(box);
          });
          this.scene.add(frame);return {group:frame,surface,mesh,backMesh};
        }
        updateLights(configs) {
          const THREE=this.THREE,keep=new Set();
          for(const config of configs) {
            keep.add(config.id);let entry=this.lights.get(config.id);
            if(!entry) {
              const light=new THREE.DirectionalLight(0xffffff,2.5);
              const marker=new THREE.Mesh(new THREE.SphereGeometry(.08,16,12),new THREE.MeshBasicMaterial({color:0xffba45}));
              const aimMarker=new THREE.Mesh(new THREE.SphereGeometry(.04,12,8),new THREE.MeshBasicMaterial({color:0x16b8ba}));
              const helper=new THREE.DirectionalLightHelper(light,.3,0xffba45);
              entry={light,marker,aimMarker,helper};this.lights.set(config.id,entry);
              this.scene.add(light,light.target,marker,aimMarker,helper);
            }
            entry.light.position.set(config.x/1000,config.y/1000,config.z/1000);
            entry.light.color.set(config.color);entry.light.intensity=config.intensity;
            entry.light.target.position.set(config.aimX/1000,config.aimY/1000,config.aimZ/1000);
            entry.light.updateMatrixWorld();entry.light.target.updateMatrixWorld();entry.helper.update();
            entry.marker.position.copy(entry.light.position);entry.aimMarker.position.copy(entry.light.target.position);
            entry.marker.visible=entry.aimMarker.visible=entry.helper.visible=lightVisibleSignal.value;
          }
          for(const [id,entry] of this.lights)if(!keep.has(id)) {
            this.scene.remove(entry.light,entry.light.target,entry.marker,entry.aimMarker,entry.helper);
            entry.helper.dispose();entry.light.dispose();
            for(const marker of [entry.marker,entry.aimMarker]){marker.geometry.dispose();marker.material.dispose();}
            this.lights.delete(id);
          }
        }
        update(plan) {
          this.updateLights(plan.lights3d);
          const keep=new Set();
          plan.walls.forEach((wall,index)=>{
            if(wall.outline.points.length<3)return;
            keep.add(wall.name);
            const used=new Set([wall.outline.pattern,...wall.patternRegions.map(r=>r.pattern)]);
            const signature=JSON.stringify([wall.outline,wall.patternRegions,wall.objects,plan.patterns.filter(p=>used.has(p.name)),this.textureRevision]);
            let entry=this.entries.get(wall.name);
            if(!entry||entry.signature!==signature){if(entry)this.dispose(entry);entry=this.build(wall,plan);entry.signature=signature;this.entries.set(wall.name,entry);}
            const p=ScenePlacement.effective(plan,wall,index);
            entry.group.position.set(p.x/1000,p.y/1000,p.z/1000);entry.group.rotation.z=p.yaw*Math.PI/180;
            // Floors lie directly on XY. Wall-local height becomes world Z.
            entry.surface.rotation.x=p.type==='floor'?0:Math.PI/2;
            // For the T unwrap, walls follow the room boundary with their front
            // normal pointing inward. Floors retain +Z extrusion above XY.
            entry.surface.scale.z=1;
            entry.surface.traverse(node=>{if(node.isMesh){const selected=node.userData.wallId===selectedWallIdSignal.value&&(node.userData.type==='object'?node.userData.objectIndex===selectedObjectIndexSignal.value:selectedObjectIndexSignal.value===null);node.material.emissive.set(selected?0x17472d:0x000000);node.material.emissiveIntensity=selected ? .4 : 0;}});
          });
          for(const [name,entry] of this.entries)if(!keep.has(name)){this.dispose(entry);this.entries.delete(name);}
          if(this.needsFit&&this.entries.size){this.fit();this.needsFit=false;}
          const status=document.getElementById('three-status');
          status.textContent=this.entries.size?'Drag to orbit · Shift / right-drag to pan · scroll or pinch to zoom · click to select'+(plan.walls.some(w=>!w.placement3d)?' · Suggested positions: edit “3D placement” to assemble your room.':''):'Load a template or add a surface to see it in 3D.';
          this.render();
        }
        fit(preset=null) {
          if(!this.renderer||!this.entries.size)return;
          const THREE=this.THREE,bounds=new THREE.Box3();for(const entry of this.entries.values())bounds.expandByObject(entry.group);
          const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
          const radius=Math.max(.5,size.length()/2),aspect=Math.max(.1,this.container.clientWidth/Math.max(1,this.container.clientHeight));
          const halfVertical=this.camera.fov*Math.PI/360,halfHorizontal=Math.atan(Math.tan(halfVertical)*aspect),distance=radius/Math.sin(Math.min(halfVertical,halfHorizontal))*1.15;
          const direction=preset==='top'?new THREE.Vector3(0,-.001,1):preset==='front'?new THREE.Vector3(0,-1,.12):preset==='perspective'?new THREE.Vector3(1,-1,.8):this.camera.position.clone().sub(this.controls.target);
          if(direction.lengthSq()<1e-12)direction.copy(this.camera.getWorldDirection(new THREE.Vector3())).negate();
          direction.normalize();this.camera.position.copy(center).addScaledVector(direction,distance);this.controls.target.copy(center);
          this.camera.near=Math.max(.01,distance/1000);this.camera.far=Math.max(100,distance*20);this.camera.updateProjectionMatrix();this.controls.update();
        }
        render() {
          if(!this.renderer||this.container.hidden)return;
          const width=this.container.clientWidth,height=this.container.clientHeight;if(!width||!height)return;
          this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.render(this.scene,this.camera);
        }
        pick(event) {
          const THREE=this.THREE,rect=this.renderer.domElement.getBoundingClientRect();
          const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),this.camera);
          const meshes=[];for(const entry of this.entries.values())entry.group.traverse(node=>{if(node.isMesh)meshes.push(node);});
          const hit=ray.intersectObjects(meshes,false)[0];selection.select(hit?.object.userData||null);
        }
      }

      class YamlSourceEditor {
        syncFromPlan(plan = effectivePlan.value) {
          if (yamlEditingSignal.value) return;
          source.value = YamlCodec.encode(plan);
          SourcePresentation.updateHighlight();
        }

        apply() {
        try {
          const plan=YamlCodec.decode(source.value);
          app.replaceDocument(plan, { change: {type:'source-apply'}, establishResetPoint: false, fitView: true });
          yamlEditingSignal.value=false;
          sourceStatus.textContent='YAML source applied to preview and controls.'; sourceStatus.classList.remove('error');
        } catch(error){sourceStatus.textContent='Invalid YAML source: '+error.message;sourceStatus.classList.add('error');}
      
        }
      }

      class EditorApp {
        constructor(planService, canvasRenderer, sourceEditor) {
          this.planService = planService;
          this.canvasRenderer = canvasRenderer;
          this.sourceEditor = sourceEditor;
        }

        replaceDocument(plan, { change = { type: 'replace' }, establishResetPoint = false, fitView = true } = {}) {
          batch(() => {
            this.planService.replaceData(plan, change);
            editorState.interactionPlan = null;
            yamlEditingSignal.value = false;
          });
          if (establishResetPoint) { resetSnapshot = this.planService.snapshot(); establishWallResetSnapshots(); }
          selection.clear();
          threePreview.needsFit=true;
          const canvas = this.planService.data.canvas;
          baseBox = canvas.width > 0 && canvas.height > 0
            ? [canvas.x, canvas.y, canvas.width, canvas.height]
            : [...EMPTY_VIEW_BOX];
          view.box = [...baseBox];
          view.scale = 1;
          TitleController.update();
          if (fitView) ViewController.fitView();
        }

        loadUploadedPlan(file) {
        if(!file)return; ActionConsole.log(`Loading “${file.name}”…`); const reader=new FileReader(); reader.onload=()=>{try{
          const text=String(reader.result||''),name=file.name.toLowerCase();
          const isYaml=name.endsWith('.yaml')||name.endsWith('.yml')||/yaml/i.test(file.type)||(!name.endsWith('.svg')&&/^\s*format\s*:\s*tiling-plan\b/m.test(text));
          let plan=isYaml?YamlCodec.decode(text):SvgCodec.decode(text); const fileBase=file.name.replace(/\.(?:svg|ya?ml)$/i,'').trim(); if(!plan.name||plan.name==='Tiling plan')plan.name=fileBase||'Tiling plan';
          this.replaceDocument(plan,{change:{type:'upload',kind:isYaml?'YAML':'SVG'},establishResetPoint:true,fitView:true});
          sourceStatus.textContent=`Uploaded ${isYaml?'YAML':'SVG'} loaded as YAML source.`;sourceStatus.classList.remove('error');UiFeedback.message(`${file.name} loaded.`);ActionConsole.log(`Loaded “${file.name}” (${isYaml?'YAML':'SVG'}).`);
        }catch(error){UiFeedback.message('Invalid plan: '+error.message);ActionConsole.log(`Load failed: ${error.message}`);}finally{uploadPlanInput.value='';}};reader.readAsText(file);
      
        }
      }

      const threePreview = new ThreePreview(threeContainer);
      effect(()=>{effectivePlan.value;lightVisibleSignal.value;selectedWallIdSignal.value;selectedObjectIndexSignal.value;threePreview.request();});
      const canvasRenderer = new CanvasRenderer();
      const yamlSourceEditor = new YamlSourceEditor();
      const app = new EditorApp(planService, canvasRenderer, yamlSourceEditor);
      effect(() => {
        effectivePlan.value;
        renderScheduler.request();
      });
      effect(() => {
        const plan = effectivePlan.value;
        if (!yamlEditingSignal.value) yamlSourceEditor.syncFromPlan(plan);
      });
      effect(() => {
        effectivePlan.value; selectedWallIdSignal.value; selectedObjectIndexSignal.value;
        render(h(ControlPanelView), sidebarMount);
      });
      const ModelChangeLog = {
        describe(change) {
          if (!change || !change.type) return '';
          switch (change.type) {
            case 'light-change': return `Changed ${change.lightId} ${change.key} to ${change.value}${['color','intensity'].includes(change.key)?'':' mm'}.`;
            case 'light-add': return `Added ${change.lightId}.`;
            case 'light-remove': return `Removed ${change.lightId}.`;
            case 'surface-placement': return `Changed 3D placement of “${change.wallName}” ${change.key} to ${change.value}.`;
            case 'wall-add': return `Added wall “${change.wallName}”.`;
            case 'wall-remove': return `Removed wall “${change.wallName}”.`;
            case 'wall-rename': return `Renamed wall “${change.oldName}” to “${change.newName}”.`;
            case 'wall-move': return `Dragged wall “${change.wallName}” to (${change.x}, ${change.y}).`;
            case 'wall-change': return `Changed wall “${change.wallName}” ${change.key} to ${change.value}.`;
            case 'wall-reset': return `Reset wall “${change.wallName}” to its loaded state.`;
            case 'object-add': return `Added element “${change.objectName || 'element'}” to wall “${change.wallName}”.`;
            case 'object-remove': return `Removed element “${change.objectName || 'element'}” from wall “${change.wallName}”.`;
            case 'object-reset': return `Reset element “${change.objectName || 'element'}” on wall “${change.wallName}” to its loaded state.`;
            case 'object-move': return `Dragged element “${change.objectName || 'element'}” on “${change.wallName}” to (${change.x}, ${change.y}).`;
            case 'object-change': return `Changed element “${change.objectName || 'element'}” on “${change.wallName}” ${change.key} to ${change.value}.`;
            case 'outline-change': return `Changed outline on “${change.wallName}” ${change.key} to ${change.value ?? 'none'}.`;
            case 'pattern-move': return `Translated pattern on “${change.wallName}” to (${change.x}, ${change.y}).`;
            case 'pattern-add': return `Added pattern “${change.patternName}”.`;
            case 'pattern-duplicate': return `Duplicated pattern “${change.patternName}” as “${change.newName}”.`;
            case 'pattern-remove': return `Removed pattern “${change.patternName}”.`;
            case 'pattern-rename': return `Renamed pattern “${change.oldName}” to “${change.newName}”.`;
            case 'pattern-change': return `Changed pattern “${change.patternName}” ${change.key} to ${change.value}.`;
            case 'pattern-region-add': return `Added pattern region ${change.index + 1} to “${change.wallName}”.`;
            case 'pattern-region-remove': return `Removed pattern region ${change.index + 1} from “${change.wallName}”.`;
            case 'pattern-region-change': return `Changed pattern region ${change.index + 1} on “${change.wallName}” ${change.key} to ${change.value}.`;
            case 'pattern-reorder': return `Reordered pattern “${change.patternName}”.`;
            case 'wall-reorder': return `Reordered wall “${change.wallName}”.`;
            case 'object-reorder': return `Reordered element “${change.objectName || 'element'}” on wall “${change.wallName}”.`;
            case 'name-change': return `Renamed plan to “${change.name}”.`;
            case 'source-apply': return 'Applied YAML source.';
            default: return '';
          }
        }
      };
      planService.onEvent(change => {
        const message = ModelChangeLog.describe(change);
        if (message) ActionConsole.log(message);
      });
      planService.onEvent(change => {
        if (!change) return;
        if (change.type === 'wall-rename' && wallResetSnapshots.has(change.oldName)) {
          const baseline = wallResetSnapshots.get(change.oldName);
          wallResetSnapshots.delete(change.oldName);
          wallResetSnapshots.set(change.newName, baseline);
          if (objectResetSnapshots.has(change.oldName)) {
            const objectBaselines = objectResetSnapshots.get(change.oldName);
            objectResetSnapshots.delete(change.oldName);
            objectResetSnapshots.set(change.newName, objectBaselines);
          }
        } else if (change.type === 'wall-add') {
          const wall = planService.wall(change.wallName);
          if (wall && !wallResetSnapshots.has(change.wallName)) wallResetSnapshots.set(change.wallName, structuredClone(wall));
          if (wall && !objectResetSnapshots.has(change.wallName)) objectResetSnapshots.set(change.wallName, wall.objects.map(object => structuredClone(object)));
        } else if (change.type === 'wall-remove') {
          wallResetSnapshots.delete(change.wallName);
          objectResetSnapshots.delete(change.wallName);
        } else if (change.type === 'object-add') {
          const object = planService.wall(change.wallName)?.objects[change.index];
          if (object) {
            const baselines = objectResetSnapshots.get(change.wallName) || [];
            baselines.splice(change.index, 0, structuredClone(object));
            objectResetSnapshots.set(change.wallName, baselines);
          }
        } else if (change.type === 'object-reorder') {
          const baselines = objectResetSnapshots.get(change.wallName);
          if (baselines && baselines[change.fromIndex]) { const [baseline] = baselines.splice(change.fromIndex, 1); baselines.splice(change.toIndex, 0, baseline); }
          if (editorState.selectedWallId === change.wallName && Number.isInteger(editorState.selectedObjectIndex)) {
            const selected = editorState.selectedObjectIndex;
            if (selected === change.fromIndex) editorState.selectedObjectIndex = change.toIndex;
            else if (change.fromIndex < selected && selected <= change.toIndex) editorState.selectedObjectIndex--;
            else if (change.toIndex <= selected && selected < change.fromIndex) editorState.selectedObjectIndex++;
          }
        } else if (change.type === 'object-remove') {
          objectResetSnapshots.get(change.wallName)?.splice(change.index, 1);
        }
      });
      const uploadPlan = document.getElementById('upload-plan');
      const uploadPlanInput = document.getElementById('upload-plan-input');
      const loadTemplateButton = document.getElementById('load-template');
      loadTemplateButton.addEventListener('click', () => {
        ActionConsole.log('Loading template…');
        try {
          const plan = YamlCodec.decode(baseModelYaml);
          app.replaceDocument(plan, { change: { type: 'template' }, establishResetPoint: true, fitView: true });
          sourceStatus.textContent = 'Template loaded.';
          sourceStatus.classList.remove('error');
          UiFeedback.message('Template loaded.');
          ActionConsole.log('Template loaded.');
        } catch (error) {
          UiFeedback.message('Could not load template: ' + error.message);
          ActionConsole.log('Template load failed: ' + error.message);
        }
      });
      uploadPlanInput.addEventListener('change', () => app.loadUploadedPlan(uploadPlanInput.files?.[0]));
      for (const type of ['dragenter', 'dragover']) uploadPlan.addEventListener(type, event => {
        event.preventDefault(); uploadPlan.classList.add('dragover');
      });
      for (const type of ['dragleave', 'drop']) uploadPlan.addEventListener(type, event => {
        event.preventDefault(); uploadPlan.classList.remove('dragover');
      });
      uploadPlan.addEventListener('drop', event => {
        const file = [...event.dataTransfer.files].find(file => /\.(svg|ya?ml)$/i.test(file.name) || file.type === 'image/svg+xml' || /yaml/i.test(file.type));
        if (file) app.loadUploadedPlan(file);
        else UiFeedback.message('Choose an SVG, YAML, or YML plan file.');
      });

      source.addEventListener('input', () => {
        yamlEditingSignal.value = true;
        SourcePresentation.updateHighlight();
        sourceStatus.textContent = 'Unapplied YAML changes.';
        sourceStatus.classList.remove('error');
      });
      source.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); yamlSourceEditor.apply.bind(yamlSourceEditor)(); }
      });
      document.getElementById('apply-source').addEventListener('click', yamlSourceEditor.apply.bind(yamlSourceEditor));
      const addWallButton = document.getElementById('add-wall');
      const addWallFromControls = event => {
        if (event) event.preventDefault();
        try {
          let index = 1;
          while (planService.data.walls.some(wall => wall.name === `wall-${index}`)) index++;
          const id = `wall-${index}`;
          const bounds = GeometryTools.planBounds(planService.data);
          const x = Math.ceil((bounds ? bounds.maxX : 0) + 100);
          const y = planService.data.walls.length ? planService.data.walls[0].y : 0;
          const pattern = planService.data.patterns.length ? planService.data.patterns[0].name : '';
          planService.addWall({
            name: id, x, y, rotation: 0,
            outline: {
              points: [[0,0],[3000,0],[3000,2150],[0,2150]],
              pattern, patternX: 0, patternY: 0,
              fill: 'white', stroke: 'red', strokeWidth: 1
            },
                  });
          ViewController.fitView();
          UiFeedback.message(`${id} added.`);
        } catch (error) {
          UiFeedback.message('Could not add wall: ' + (error && error.message ? error.message : String(error)));
          ViewController.drawCanvas();
        }
      };
      addWallButton.addEventListener('click', addWallFromControls);
      
      const planTitle = document.getElementById('plan-title');
      const editPlanTitle = document.getElementById('edit-plan-title');
      editPlanTitle.addEventListener('click', TitleController.beginEdit);
      planService.onEvent(change => { if (change && change.type === 'name-change') TitleController.update(); });
      TitleController.update();

      const helpDialog = document.getElementById('help-dialog');
      const devHelpDialog = document.getElementById('dev-help-dialog');
      const openDialog = dialog => {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      };
      document.getElementById('open-help').addEventListener('click', () => openDialog(helpDialog));
      document.getElementById('open-dev-help').addEventListener('click', () => openDialog(devHelpDialog));
      document.getElementById('close-help').addEventListener('click', () => helpDialog.close());
      document.getElementById('close-dev-help').addEventListener('click', () => devHelpDialog.close());
      helpDialog.addEventListener('click', event => { if (event.target === helpDialog) helpDialog.close(); });
      devHelpDialog.addEventListener('click', event => { if (event.target === devHelpDialog) devHelpDialog.close(); });

      document.getElementById('reset').addEventListener('click', () => {
        app.replaceDocument(resetSnapshot,{change:{type:'reset'},establishResetPoint:false,fitView:true});
        sourceStatus.textContent='Plan reset.';sourceStatus.classList.remove('error');UiFeedback.message('Plan reset.');
      });
      document.getElementById('copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(source.value); UiFeedback.message('YAML source copied.'); }
        catch { UiFeedback.message('Clipboard unavailable. Select the source and copy it manually.'); }
      });
      document.getElementById('download-yaml').addEventListener('click', () => {
        const blob = new Blob([YamlCodec.encode()], { type: 'text/yaml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = `${TitleController.downloadBaseName()}.yaml`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        UiFeedback.message('YAML downloaded.');
      });
      document.getElementById('download').addEventListener('click', () => {
        const blob = new Blob([SvgCodec.encode(planService.snapshot())], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = `${TitleController.downloadBaseName()}.svg`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        UiFeedback.message('SVG downloaded.');
      });
      document.getElementById('download-png').addEventListener('click', () => {
        ViewController.drawCanvasNow();
        canvas.toBlob(blob => {
          if (!blob) { UiFeedback.message('Could not create PNG.'); return; }
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a'); link.href = url; link.download = `${TitleController.downloadBaseName()}.png`; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          UiFeedback.message('PNG downloaded.');
        }, 'image/png');
      });
      publishPersistentPlan();
      ViewController.updateView();
    }

    init();
  