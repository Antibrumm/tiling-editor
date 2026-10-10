import { number } from './format';
const translateRe =
  /(?:^|\s)translate\(\s*([+-]?(?:\d+\.?\d*|\.\d+))(?:[\s,]+([+-]?(?:\d+\.?\d*|\.\d+)))?\s*\)/;
/**
 * Reads translate and rotate components from SVG transform attributes.
 * Updates translation while retaining the remaining transform text, including when
 * working with patternTransform. This helper does not evaluate arbitrary SVG matrices.
 */
export class Transform2D {
  public translation(element: Element, attribute = 'transform') {
    const match = (element.getAttribute(attribute) || '').match(translateRe);
    return match ? [Number(match[1]), Number(match[2] || 0)] : [0, 0];
  }
  public setTranslation(element: Element, x: number, y: number, attribute = 'transform') {
    const previous = element.getAttribute(attribute) || '';
    const remainder = previous.replace(translateRe, '').trim();
    element.setAttribute(
      attribute,
      `translate(${number(x)} ${number(y)})${remainder ? ' ' + remainder : ''}`,
    );
  }
  public rotation(element: Element, attribute = 'transform') {
    const match = (element.getAttribute(attribute) || '').match(
      /(?:^|\s)rotate\(\s*([+-]?(?:\d+\.?\d*|\.\d+))/,
    );
    return match ? Number(match[1]) : 0;
  }
}
