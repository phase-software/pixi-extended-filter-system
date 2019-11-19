import { EFSystem } from './EFSystem';

/**
 * @param {PIXI.Renderer} renderer
 */
export function injectHPPF(renderer)
{
    const hppf = new EFSystem(renderer);

    renderer.runners.forEach((runner) =>
    {
        runner.remove(renderer.filter);
        runner.add(hppf);
    });

    renderer.filter = hppf;
}

export { Filter, Filter as default } from './Filter';
