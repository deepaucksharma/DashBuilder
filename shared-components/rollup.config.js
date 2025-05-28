import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import postcss from 'rollup-plugin-postcss';
import { readFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

const plugins = [
  peerDepsExternal(),
  resolve({
    extensions: ['.js', '.jsx'],
  }),
  postcss({
    extract: true,
    minimize: true,
    modules: false,
    extensions: ['.css'],
  }),
  babel({
    babelHelpers: 'bundled',
    presets: ['@babel/preset-env', '@babel/preset-react'],
    extensions: ['.js', '.jsx'],
    exclude: 'node_modules/**',
  }),
  commonjs(),
  terser(),
];

export default [
  // ESM build
  {
    input: 'src/index.js',
    output: [
      {
        file: packageJson.module,
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins,
    external: ['react', 'react-dom', 'prop-types'],
  },
  // CommonJS build
  {
    input: 'src/index.js',
    output: [
      {
        file: packageJson.main,
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
    ],
    plugins,
    external: ['react', 'react-dom', 'prop-types'],
  },
  // UMD build for browser
  {
    input: 'src/index.js',
    output: [
      {
        file: 'dist/index.umd.js',
        format: 'umd',
        name: 'DashBuilderComponents',
        sourcemap: true,
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'prop-types': 'PropTypes',
        },
      },
    ],
    plugins,
    external: ['react', 'react-dom', 'prop-types'],
  },
];