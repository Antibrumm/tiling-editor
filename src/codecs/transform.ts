import { number } from './format';
const translateRe =
  /(?:^|\s)translate\(\s*([+-]?(?:\d+\.?\d*|\.\d+))(?:[\s,]+([+-]?(?:\d+\.?\d*|\.\d+)))?\s*\)/;
export class Transform2D {
  static translation(element: Element, attribute = 'transform') {
    const match = (element.getAttribute(attribute) || '').match(translateRe);
    return match ? [Number(match[1]), Number(match[2] || 0)] : [0, 0];
  }
  static setTranslation(element: Element, x: number, y: number, attribute = 'transform') {
    const previous = element.getAttribute(attribute) || '';
    const remainder = previous.replace(translateRe, '').trim();
    element.setAttribute(
      attribute,
      `translate(${number(x)} ${number(y)})${remainder ? ' ' + remainder : ''}`,
    );
  }
  static rotation(element: Element, attribute = 'transform') {
    const match = (element.getAttribute(attribute) || '').match(
      /(?:^|\s)rotate\(\s*([+-]?(?:\d+\.?\d*|\.\d+))/,
    );
    return match ? Number(match[1]) : 0;
  }
}
