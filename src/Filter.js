import { Filter as BaseFilter } from 'pixi.js';
import defaultFragment from './defaultFilter.frag';

/**
 *
 */
export class Filter extends BaseFilter
{
    /** @override */
    constructor(vertex, fragment = defaultFragment, uniforms)
    {
        super(vertex, fragment, uniforms);
    }

    /**
     * Measures the input frame needed by this filter to calculate pixels
     * in the pass-output. It should keep the results in `Filter#frame`
     * @param {PIXI.Rectangle} targetBounds - bounds of the target object
     * @param {PIXI.Rectangle} passBounds - frame in which output is required
     */
    measure(targetBounds, passBounds)
    {
        this._frame = passBounds;
    }

    get frame()
    {
        return this._frame;
    }

    static get defaultVertexSrc()
    {
        return BaseFilter.defaultVertexSrc;
    }

    static get defaultFragmentSrc()
    {
        return defaultFragment;
    }
}

export default Filter;
