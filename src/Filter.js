import { Filter as BaseFilter } from 'pixi.js';
import defaultFragment from './defaultFilter.frag';
import translateInputVertex from './translateInput.vert';
import translateInputFragment from './translateInput.frag';
import acsVertex from './acs.vert';

/**
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
     * @param {number} padding - padding applied in the target bounds
     */
    measure(targetBounds, passBounds, padding)
    {
        this._frame = passBounds;
        this._renderable = true;
    }

    /**
     * Input frame required by this filter, as recorded by the last measure
     * pass.
     * @returns {PIXI.Rectangle}
     */
    get frame()
    {
        return this._frame;
    }

    /**
     * Whether this filter can be applied without reducing the refresh rate
     * significantly
     * @returns {boolean}
     */
    get renderable()
    {
        return this._renderable;
    }

    static get defaultVertexSrc()
    {
        return BaseFilter.defaultVertexSrc;
    }

    static get defaultFragmentSrc()
    {
        return defaultFragment;
    }

    static get translateInputVertexSrc()
    {
        return translateInputVertex;
    }

    static get translateInputFragmentSrc()
    {
        return translateInputFragment;
    }

    static get acsVertexSrc()
    {
        return acsVertex;
    }
}

export default Filter;
