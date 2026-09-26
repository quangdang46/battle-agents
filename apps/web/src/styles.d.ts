/**
 * Stylesheets are a side-effect import, and tsc has no type for one.
 *
 * Next's bundler resolves `import './globals.css'` from the layout; `tsc` reads
 * the same import and asks what type a stylesheet is, and the answer in its
 * absence is TS2307. This file is that answer, and it is narrow on purpose: only
 * a stylesheet, not a blanket `declare module '*'`, which would silence every
 * unresolved specifier in the app including the ones that are typos.
 */
declare module '*.css';
