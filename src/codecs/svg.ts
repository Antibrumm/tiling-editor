import { PlanService } from '../model/plan-service';
import type { Plan, Point } from '../model/types';
import { number } from './format';
import { Transform2D } from './transform';
import { textureRotationQuarter } from '../rendering/texture-rotation';

export class SvgCodec {
  static formatXml(xmlText: string) {
    const tokens=xmlText.replace(/>\s*</g,'><').trim().replace(/</g,'\n<').trim().split('\n'); let depth=0; const lines=[];
    for(const raw of tokens){const token=raw.trim();if(!token)continue;if(/^<\//.test(token))depth=Math.max(0,depth-1);lines.push('  '.repeat(depth)+token);if(/^<[^!?/][^>]*>$/.test(token)&&!(/\/>$/.test(token))&&!/^<[^>]+>.*<\//.test(token))depth++;}
    return lines.join('\n');
  }
  static decode(input: string): Plan {
    const root=typeof input==='string'?new DOMParser().parseFromString(input,'image/svg+xml').documentElement:input;
    if(!root||root.localName!=='svg'||root.querySelector('parsererror'))throw new Error('Invalid SVG plan.');
    if(root.querySelector('script, foreignObject')||[...root.querySelectorAll('*')].some(el=>[...el.attributes].some(a=>/^on/i.test(a.name))))throw new Error('Scripts and inline event handlers are not allowed.');
    const numeric=(v: string | null | undefined,f=0)=>{const n=Number.parseFloat(String(v??''));return Number.isFinite(n)?n:f;};
    const parsePoints=(v: string | null | undefined): Point[]=>String(v??'').trim().split(/\s+/).filter(Boolean).map(pair=>pair.split(',').map(Number)).filter((p): p is Point=>p.length===2&&p.every(Number.isFinite));
    const byId=(id: string)=>[...root.querySelectorAll('[id]')].find(n=>n.id===id)||null;
    const vb=(root.getAttribute('viewBox')||'0 0 0 0').trim().split(/[\s,]+/).map(Number); if(vb.length!==4||vb.some(n=>!Number.isFinite(n))||vb[2]<=0||vb[3]<=0)throw new Error('SVG needs a valid viewBox.');
    const flipped=root.querySelector('#flipped-drawing'); const [,fy]=flipped?Transform2D.translation(flipped):[0,NaN];
    const allPatterns=[...root.querySelectorAll('pattern[id]')];
    const definitions=allPatterns.filter(p=>p.id==='tile-pattern'||p.hasAttribute('data-tile-definition')||p.querySelector(':scope > rect[data-tile]')||(!p.getAttribute('href')&&!p.getAttribute('xlink:href')&&p.querySelector(':scope > rect')));
    const patterns=definitions.map(p=>{const tile=p.querySelector(':scope > rect[data-tile]')||p.querySelector(':scope > rect');const background=p.querySelector(':scope > rect[data-border]');const tileWidth=numeric(tile?.getAttribute('width'));const tileHeight=numeric(tile?.getAttribute('height'));const repeatCols=Math.max(1,numeric(p.getAttribute('data-repeat-cols'),1));const repeatRows=Math.max(1,numeric(p.getAttribute('data-repeat-rows'),1));const patternWidth=numeric(p.getAttribute('width'),tileWidth)/repeatCols;const patternHeight=numeric(p.getAttribute('height'),tileHeight)/repeatRows;const widthGap=Math.max(0,patternWidth-tileWidth);const borderSize=widthGap;const texture=p.querySelector(':scope > image[data-tile-texture]');return{name:p.id,tileWidth,tileHeight,borderSize,tileColor:tile?.getAttribute('fill')||'#ffffff',borderColor:background?.getAttribute('fill')||tile?.getAttribute('stroke')||'#888888',tileTexture:texture?.getAttribute('href')||texture?.getAttribute('xlink:href')||'',randomTextureRotation:p.getAttribute('data-random-texture-rotation')==='true'};});
    const walls=[...root.querySelectorAll('g.wall')].map(w=>{const [x,y]=Transform2D.translation(w),outline=w.querySelector(':scope > polygon.outline');const fill=outline?.getAttribute('fill')||'';const m=fill.match(/^url\(#(.+)\)$/);const ref=m?.[1]||outline?.getAttribute('data-pattern-ref')||'';const wrapper=ref?byId(ref):null;const href=wrapper?.getAttribute('href')||wrapper?.getAttribute('xlink:href')||'';const pattern=href.startsWith('#')?href.slice(1):(definitions.some(p=>p.id===ref)?ref:'');const [patternX,patternY]=wrapper?Transform2D.translation(wrapper,'patternTransform'):[0,0];const patternRotation=wrapper?Transform2D.rotation(wrapper,'patternTransform'):0;return{name:w.id||w.getAttribute('name')||'',x,y,rotation:Transform2D.rotation(w),placement3d:(()=>{try{return JSON.parse(w.getAttribute('data-placement-3d')||'null');}catch{return null;}})(),outline:{points:parsePoints(outline?.getAttribute('points')),pattern,patternX,patternY,patternRotation,fill:pattern?'white':(outline?.getAttribute('fill')||'white'),stroke:outline?.getAttribute('stroke')||'',strokeWidth:numeric(outline?.getAttribute('stroke-width'),1)},objects:[...w.querySelectorAll(':scope > rect.obj')].map(o=>{const [tx,ty]=Transform2D.translation(o);return{name:o.getAttribute('name')||'',x:numeric(o.getAttribute('x'))+tx,y:numeric(o.getAttribute('y'))+ty,width:numeric(o.getAttribute('width')),height:numeric(o.getAttribute('height')),depth:numeric(o.getAttribute('data-depth'),10),fill:o.getAttribute('fill')||''};})};});
    return PlanService.normalizeData({upAxis3d:root.getAttribute('data-up-axis-3d') || undefined,lights3d:(()=>{try{return JSON.parse(root.getAttribute('data-lights-3d')||'null');}catch{return null;}})(),light3d:(()=>{try{return JSON.parse(root.getAttribute('data-light-3d')||'null');}catch{return null;}})(),name:root.getAttribute('data-plan-name')||root.querySelector(':scope > title')?.textContent?.trim()||'Tiling plan',units:'mm',patterns,walls});
  }

  static encode(planInput: Plan) {
    const plan=planInput,canvas=PlanService.canvasFromWalls(plan.walls),ns='http://www.w3.org/2000/svg',doc=document.implementation.createDocument(ns,'svg',null),svg=doc.documentElement;
    svg.setAttributeNS('http://www.w3.org/2000/xmlns/','xmlns',ns);svg.setAttribute('data-up-axis-3d','z');svg.setAttribute('data-lights-3d',JSON.stringify(plan.lights3d));svg.setAttribute('data-plan-name',plan.name);svg.setAttribute('viewBox',[canvas.x,canvas.y,canvas.width,canvas.height].map(number).join(' '));svg.setAttribute('width',`${number(canvas.width)}${plan.units}`);svg.setAttribute('height',`${number(canvas.height)}${plan.units}`);
    const defs=doc.createElementNS(ns,'defs');svg.append(defs);
    for(const p of plan.patterns){const cellWidth=p.tileWidth+p.borderSize,cellHeight=p.tileHeight+p.borderSize;const repeat=p.tileTexture&&p.randomTextureRotation?4:1;const patternWidth=cellWidth*repeat,patternHeight=cellHeight*repeat;const pat=doc.createElementNS(ns,'pattern');pat.id=p.name;pat.setAttribute('width',number(patternWidth));pat.setAttribute('height',number(patternHeight));pat.setAttribute('patternUnits','userSpaceOnUse');if(p.name!=='tile-pattern')pat.setAttribute('data-tile-definition','true');if(repeat>1){pat.setAttribute('data-repeat-cols',String(repeat));pat.setAttribute('data-repeat-rows',String(repeat));pat.setAttribute('data-random-texture-rotation','true');}const border=doc.createElementNS(ns,'rect');border.setAttribute('data-border','true');border.setAttribute('x','0');border.setAttribute('y','0');border.setAttribute('width',number(patternWidth));border.setAttribute('height',number(patternHeight));border.setAttribute('fill',p.borderColor||'#888888');pat.append(border);for(let row=0;row<repeat;row++){for(let col=0;col<repeat;col++){const x=col*cellWidth,y=row*cellHeight;const tile=doc.createElementNS(ns,'rect');tile.setAttribute('data-tile','true');tile.setAttribute('x',number(x));tile.setAttribute('y',number(y));tile.setAttribute('width',number(p.tileWidth));tile.setAttribute('height',number(p.tileHeight));tile.setAttribute('fill',p.tileColor||'#ffffff');pat.append(tile);if(p.tileTexture){const image=doc.createElementNS(ns,'image');image.setAttribute('data-tile-texture','true');const rotation=p.randomTextureRotation?textureRotationQuarter(col,row):0;const quarter=rotation%2;const drawWidth=quarter?p.tileHeight:p.tileWidth,drawHeight=quarter?p.tileWidth:p.tileHeight;image.setAttribute('x',number(-drawWidth/2));image.setAttribute('y',number(-drawHeight/2));image.setAttribute('width',number(drawWidth));image.setAttribute('height',number(drawHeight));image.setAttribute('preserveAspectRatio','none');image.setAttribute('href',p.tileTexture);image.setAttribute('transform',`translate(${number(x+p.tileWidth/2)} ${number(y+p.tileHeight/2)}) rotate(${rotation*90})`);pat.append(image);}}}defs.append(pat);}
    const drawing=doc.createElementNS(ns,'g');drawing.id='flipped-drawing';drawing.setAttribute('transform',`translate(0 ${number(canvas.flipY)}) scale(1 -1)`);svg.append(drawing);
    for(const w of plan.walls){const g=doc.createElementNS(ns,'g');g.id=w.name;if(w.placement3d)g.setAttribute('data-placement-3d',JSON.stringify(w.placement3d));g.setAttribute('class','wall');g.setAttribute('transform',`translate(${number(w.x)} ${number(w.y)}) rotate(${number(w.rotation)})`);const poly=doc.createElementNS(ns,'polygon');poly.setAttribute('class','outline');poly.setAttribute('points',w.outline.points.map(p=>`${number(p[0])},${number(p[1])}`).join(' '));if(w.outline.pattern){let pid=`${w.name}-tile-pattern`,n=2;while([...defs.querySelectorAll('pattern[id]')].some(p=>p.id===pid))pid=`${w.name}-tile-pattern-${n++}`;const wrap=doc.createElementNS(ns,'pattern');wrap.id=pid;wrap.setAttribute('href',`#${w.outline.pattern}`);wrap.setAttribute('patternTransform',`translate(${number(w.outline.patternX)} ${number(w.outline.patternY)}) rotate(${number(w.outline.patternRotation||0)})`);defs.append(wrap);poly.setAttribute('fill',`url(#${pid})`);}else poly.setAttribute('fill',w.outline.fill||'white');if(w.outline.stroke)poly.setAttribute('stroke',w.outline.stroke);poly.setAttribute('stroke-width',number(w.outline.strokeWidth));g.append(poly);for(const o of w.objects){const r=doc.createElementNS(ns,'rect');r.setAttribute('class','obj');r.setAttribute('data-depth',number(o.depth||10));r.setAttribute('name',o.name);r.setAttribute('x','0');r.setAttribute('y','0');r.setAttribute('transform',`translate(${number(o.x)} ${number(o.y)})`);r.setAttribute('width',number(o.width));r.setAttribute('height',number(o.height));r.setAttribute('fill',o.fill||'red');r.setAttribute('fill-opacity','0.2');g.append(r);}drawing.append(g);}
    return SvgCodec.formatXml(new XMLSerializer().serializeToString(svg));
  }
  static snapshot(planInput: Plan) {
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

  static validateRoundTrip(input: string) {
    const first = SvgCodec.decode(input);
    const encoded = SvgCodec.encode(first);
    const second = SvgCodec.decode(encoded);
    const before = SvgCodec.snapshot(first);
    const after = SvgCodec.snapshot(second);
    const equal = JSON.stringify(before) === JSON.stringify(after);
    return { equal, before, after, encoded };
  }
}
