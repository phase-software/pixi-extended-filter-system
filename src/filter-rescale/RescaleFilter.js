import { Filter } from '../Filter';
import rescaleVertexSrc from './rescale.vert';

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
    }
}
