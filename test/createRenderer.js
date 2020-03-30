const PIXI = require('pixi.js');
const { injectEF } = require('../');

module.exports = {
    createRenderer()
    {
        return injectEF(PIXI.autoDetectRenderer());
    },
};
