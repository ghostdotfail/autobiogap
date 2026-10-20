import { version } from '../package.json';

declare const BUILD_SHA: string;
/** `git describe --always --dirty` at build time (`bun run build`); 'unbuilt' when run from source. */
export const EXTENSION_BUILD = typeof BUILD_SHA === 'undefined' ? 'unbuilt' : BUILD_SHA;
/** package.json version */
export const EXTENSION_SEMVER = version;
/** Key in recipe.json `extensions` object */
export const EXTENSION_NAME = 'autobiogap' as const;
