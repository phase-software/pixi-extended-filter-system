import { FilterSystem } from './FilterSystem';

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
}

export { CompositeFilter } from './CompositeFilter';
export { Filter, Filter as default } from './Filter';
export { FilterPipe } from './FilterPipe';
export { FilterScope } from './FilterScope';
export { FILTER_RECTS } from './FilterRects';
