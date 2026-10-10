import type { PlanObject } from './types';

export class ObjectLayers {
  static offsets(objects: PlanObject[]) {
    const offsets=new Map<number, number>(),placed: {object: PlanObject; front: number}[]=[];
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
