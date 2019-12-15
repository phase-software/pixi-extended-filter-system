import { EFSystem } from './EFSystem';
import { FilterPipe } from './FilterPipe';

/**
 * @param {PIXI.Renderer} renderer
 */
export function injectEF(renderer)
{
    const hppf = new EFSystem(renderer);

    for (const i in renderer.runners)
    {
        renderer.runners[i].remove(renderer.filter);
        renderer.runners[i].add(hppf);
    }

    renderer.filter = hppf;
}

export { Filter, Filter as default } from './Filter';
export { FilterPipe } from './FilterPipe';
