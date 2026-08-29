// What the convert-import Edge Function needs out of the app's own library.
//
// An explicit surface rather than "whatever the bundler dragged along": these
// five names are the entire contract between the app and the function, and a
// sixth appearing here should be a decision somebody made, visible in a diff.
//
// scripts/build-edge-prompt.mjs bundles this file and splices the result into
// the function's "#region prompt". Nothing imports it at runtime.
export { buildImportPrompt } from '../../src/app/lib/importPrompt';
export { TRIP_SEP, isTripName, tripBodyOf, travelCategoryOf } from '../../src/app/lib/trips';
