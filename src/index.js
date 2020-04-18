import { FilterSystem } from './FilterSystem';

/**
 * @namespace PHX
 */

/**
 * @param {PIXI.Renderer} renderer
 */
export function injectEF(renderer)
{
    const hppf = new FilterSystem(renderer);

    for (const i in renderer.runners)
    {
        renderer.runners[i].remove(renderer.filter);
        renderer.runners[i].add(hppf);
    }

    renderer.filter = hppf;

    return renderer;
}

export { CompositeFilter } from './CompositeFilter';
export { Filter, Filter as default } from './Filter';
export * from './FilterPipe';
export * from './FilterScope';
export { FILTER_RECTS } from './FilterRects';
export * from './FilterPass';
