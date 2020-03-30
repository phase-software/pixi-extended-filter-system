const { createRenderer } = require('./createRenderer');
const PIXI = require('pixi.js');
const { Filter, FilterPipe } = require('../');

/**
 * Creates mock renderer with a filter system that has "pushed" the filters of
 * a mock target display-object.
 *
 * @param {Filter[]} filters
 * @param {object} options
 */
function createMockScope(filters = [new Filter()], options)
{
    const renderer = createRenderer();
    const target = new PIXI.Graphics().drawRect(0, 0, 100, 100);

    target.filters = filters;

    renderer.filter.push(target, target.filters, options);
    renderer.filter.activeState.inputWritable = true;
    renderer.filter.activeState.outputSwappable = true;

    return [renderer, filters, target];
}

/**
 * Creates a mock filter-pipe with the active state of the filter manager.
 *
 * @param {Renderer} renderer
 * @param {RenderTexture} input
 * @param {RenderTexture} output
 * @param {boolean} clear
 */
function createMockPipe(renderer, input, output, clear)
{
    const inputTexture = input ? input : renderer.filter.getFilterTexture(renderer.filter.activeState.renderTexture);
    const outputTexture = output ? output : renderer.filter.getFilterTexture(inputTexture);

    const pipe = new FilterPipe();

    pipe.open(renderer.filter, inputTexture, outputTexture, clear, renderer.filter.activeState);

    return pipe;
}

module.exports = {
    createMockScope,
    createMockPipe,
};
