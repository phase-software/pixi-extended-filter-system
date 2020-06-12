import { Filter } from './Filter';

/**
 * Filters that are composed of additional filter passes should extend this
 * instead for lifecycle methods.
 */
export class CompositeFilter extends Filter
{
    constructor(...args)
    {
        super(...args);

        /**
         * Filters owned by this.
         * @readonly
         * @member {Filter[]}
         */
        this.nestedFilters = [];
    }

    /**
     * Keep the given filter as a nested filter. This will bind the padding
     * & other properties of this filter to the nested filter.
     *
     * @param {PIXI.Filter} filter
     * @param {boolean}[noBind=false] - prevents uniform binding from parent to child
     * @returns {PIXI.Filter} the given filter
     * @protected
     */
    keep(filter, noBind = false)
    {
        filter.parentFilter = this;
        filter.uniforms.binding = noBind ? null : this.uniformGroup;

        this.nestedFilters.push(filter);

        return filter;
    }

    /**
     * Remove the given filter from the nested filters.
     * @param {PIXI.Filter} filter
     * @protected
     */
    kick(filter)
    {
        const index = this.nestedFilters.indexOf(filter);

        if (index > 0)
        {
            filter.uniforms.binding = null;
            filter.parentFilter = null;
            this.nestedFilters.splice(index, 1);
        }
    }
}
