import { assetExtension } from '@pxe/schema';

/**
 * Extension → Pixi loader parser.
 *
 * Pixi chooses a loader by looking at the URL extension (`checkExtension`), and
 * `blob:` URLs have none, so both the editor and the runtime pass an explicit
 * parser for manifest entries. Keeping the table in the shared rendering package
 * means the editor preview and Play load the same asset with the same parser.
 */
const parserByExtension: Record<string, string> = {
  png: 'texture',
  jpg: 'texture',
  jpeg: 'texture',
  webp: 'texture',
  gif: 'texture',
  avif: 'texture',
  bmp: 'texture',
  ico: 'texture',
  svg: 'svg',
  ttf: 'web-font',
  otf: 'web-font',
  woff: 'web-font',
  woff2: 'web-font',
  json: 'json',
  txt: 'text',
  mp4: 'video',
  webm: 'video',
  m4v: 'video',
};

/** `undefined` means "let Pixi decide from the URL". */
export function loadParserForFormat(format: string | undefined): string | undefined {
  if (!format) {
    return undefined;
  }

  return parserByExtension[format.toLowerCase().replace(/^\./, '')];
}

/** Convenience for callers that only have the source path. */
export function loadParserForPath(path: string): string | undefined {
  return loadParserForFormat(assetExtension(path));
}

/** Arguments for `Assets.add` / `Assets.load` of a manifest entry. */
export function pixiAssetSource(url: string, format?: string): { src: string; parser?: string } {
  const parser = loadParserForFormat(format);
  return parser ? { src: url, parser } : { src: url };
}
