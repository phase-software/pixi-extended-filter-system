import sourcemaps from 'rollup-plugin-sourcemaps';
import commonjs from 'rollup-plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import glsl from 'rollup-plugin-glsl';
import path from 'path';

function main()
{
    const plugins = [
        sourcemaps(),
        commonjs({
            browser: true,
            preferBuiltins: false,
        }),
        glsl({
            include: ['src/**/*.vert', 'src/**/*.frag'],
        }),
        resolve(),
    ];

    const external = ['pixi.js'];
    const input = 'src/index.js';
    const sourcemap = true;

    return [
        {
            input,
            output: {
                file: path.join(__dirname, 'lib/phase-filter-manager.mjs'),
                format: 'esm',
                sourcemap,
            },
            plugins,
            external,
        },
        {
            input,
            output: {
                file: path.join(__dirname, 'lib/phase-filter-manager.cjs'),
                format: 'cjs',
                sourcemap,
            },
            plugins,
            external,
        },
        {
            input,
            output: {
                file: path.join(__dirname, 'dist/phase-filter-manager.js'),
                format: 'esm',
                sourcemap,
            },
            plugins,
            external,
        },
    ];
}

export default main();
