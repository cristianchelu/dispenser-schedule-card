import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';
import css from "rollup-plugin-import-css";
import json from '@rollup/plugin-json';

export default {
  input: 'src/feeder-card.ts',
  output: [{
    file: 'dist/feeder-card.js',
    format: 'esm'
  }, {
    file: 'dist/feeder-card.min.js',
    plugins: [terser()]
  }],
  plugins: [
    nodeResolve({}),
    typescript(),
    css(),
    json()
  ]
};