import { Filter } from '../Filter';
import rescaleVertexSrc from './rescale.vert';
import { SCALE_MODES } from 'pixi.js';

/**
 * Instead of applying a "shift" to fragments from the input-frame into the
 * output-frame, the rescale-filter will transform the vertex stream so that
 * all of the input-frame is visible in the output-frame.
 *
 * @class
 * @extends PIXI.Filter
 */
export class RescaleFilter extends Filter
{
    constructor()
    {
        super(rescaleVertexSrc, Filter.defaultFragmentSrc);

        this.scaleMode = SCALE_MODES.LINEAR;
    }

    apply(filterManager, input, output, clear, state)
    {
        const sm = input.scaleMode;

        input.baseTexture.scaleMode = this.scaleMode;
        input.baseTexture.update();
        super.apply(filterManager, input, output, clear, state);
        input.baseTexture.scaleMode = sm;
    }
}
