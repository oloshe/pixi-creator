import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 3;

export const AssetRefSchema = z.object({
  assetId: z.string().min(1),
});

export type AssetRef = z.infer<typeof AssetRefSchema>;

export const NodeRefSchema = z.object({
  nodeId: z.string().min(1),
});

export type NodeRef = z.infer<typeof NodeRefSchema>;

/* -------------------------------------------------------------------------- */
/* Canvas / design resolution                                                  */
/* -------------------------------------------------------------------------- */

export const ResizeModeSchema = z.enum([
  'contain',
  'cover',
  'fixed-width',
  'fixed-height',
  'stretch',
]);

export type ResizeMode = z.infer<typeof ResizeModeSchema>;

export const SceneOrientationSchema = z.enum(['portrait', 'landscape', 'any']);

export type SceneOrientation = z.infer<typeof SceneOrientationSchema>;

export const SceneSettingsSchema = z.object({
  designWidth: z.number().positive(),
  designHeight: z.number().positive(),
  backgroundColor: z.string().min(1),
  resizeMode: ResizeModeSchema,
  orientation: SceneOrientationSchema,
  clipContent: z.boolean(),
});

export type SceneSettings = z.infer<typeof SceneSettingsSchema>;

export const defaultSceneSettings: SceneSettings = {
  designWidth: 750,
  designHeight: 1334,
  backgroundColor: '#000000',
  resizeMode: 'contain',
  orientation: 'portrait',
  clipContent: true,
};

export function createDefaultSceneSettings(
  overrides: Partial<SceneSettings> = {},
): SceneSettings {
  return { ...defaultSceneSettings, ...overrides };
}

/** Quick input only. Scenes always store designWidth / designHeight. */
export interface ResolutionPreset {
  label: string;
  width: number;
  height: number;
}

export const resolutionPresets: ResolutionPreset[] = [
  { label: '750 × 1334', width: 750, height: 1334 },
  { label: '1080 × 1920', width: 1080, height: 1920 },
  { label: '720 × 1280', width: 720, height: 1280 },
  { label: '1920 × 1080', width: 1920, height: 1080 },
  { label: '1280 × 720', width: 1280, height: 720 },
  { label: '375 × 812', width: 375, height: 812 },
  { label: '390 × 844', width: 390, height: 844 },
  { label: '414 × 896', width: 414, height: 896 },
];

export const CUSTOM_PRESET_LABEL = 'Custom';

export function matchResolutionPreset(
  width: number,
  height: number,
  presets: ResolutionPreset[] = resolutionPresets,
): ResolutionPreset | null {
  return presets.find((preset) => preset.width === width && preset.height === height) ?? null;
}

/* -------------------------------------------------------------------------- */
/* RectTransform                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Logical rectangle of a node.
 *
 * `pivotX` / `pivotY` are normalized (`0 → 1`, top-left → bottom-right) and are
 * the single pivot representation of the engine: Pixi's pixel pivot and the
 * sprite `anchor` are both derived from them.
 *
 * `x` / `y` place the pivot point inside the parent's local space, whose origin
 * is the parent's top-left corner and whose +Y axis points down.
 */
export const RectTransformSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  pivotX: z.number(),
  pivotY: z.number(),
  scaleX: z.number(),
  scaleY: z.number(),
  rotationDeg: z.number(),
  alpha: z.number(),
  visible: z.boolean(),
});

export type RectTransformData = z.infer<typeof RectTransformSchema>;

/** @deprecated kept as an alias so older imports keep compiling. */
export type TransformData = RectTransformData;
/** @deprecated kept as an alias so older imports keep compiling. */
export const TransformSchema = RectTransformSchema;

export const defaultRectWidth = 100;
export const defaultRectHeight = 100;

export function createDefaultTransform(overrides: Partial<RectTransformData> = {}): RectTransformData {
  return {
    x: 0,
    y: 0,
    width: defaultRectWidth,
    height: defaultRectHeight,
    pivotX: 0,
    pivotY: 0,
    scaleX: 1,
    scaleY: 1,
    rotationDeg: 0,
    alpha: 1,
    visible: true,
    ...overrides,
  };
}

/** @deprecated use {@link createDefaultTransform}. */
export const createDefaultRectTransform = createDefaultTransform;

/* -------------------------------------------------------------------------- */
/* Nodes                                                                       */
/* -------------------------------------------------------------------------- */

export const ComponentSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  enabled: z.boolean(),
  props: z.record(z.unknown()),
});

export type ComponentData = z.infer<typeof ComponentSchema>;

/** Default layer stack. Layer names are free-form strings on nodes. */
export const defaultLayers = ['Background', 'World', 'Effects', 'UI', 'Overlay', 'Debug'] as const;

export type DefaultLayer = (typeof defaultLayers)[number];

export const defaultLayer: DefaultLayer = 'World';

export type NodeData = {
  id: string;
  name: string;
  active: boolean;
  layer?: string;
  zIndex: number;
  transform: RectTransformData;
  components: ComponentData[];
  children: NodeData[];
};

export const NodeSchema: z.ZodType<NodeData, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: z.string(),
    active: z.boolean(),
    layer: z.string().optional(),
    zIndex: z.number().default(0),
    transform: RectTransformSchema,
    components: z.array(ComponentSchema),
    children: z.array(NodeSchema),
  }),
) as z.ZodType<NodeData, z.ZodTypeDef, unknown>;

/* -------------------------------------------------------------------------- */
/* Scene                                                                       */
/* -------------------------------------------------------------------------- */

export const SceneSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string(),
  settings: SceneSettingsSchema,
  root: NodeSchema,
});

export type SceneData = z.infer<typeof SceneSchema>;

/** Canvas is the fixed design coordinate space. Returns whether data changed. */
export function normalizeRootTransform(root: NodeData, settings: SceneSettings): boolean {
  const identity = {
    x: 0, y: 0, rotationDeg: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0,
    width: settings.designWidth, height: settings.designHeight,
  };
  const changed = Object.entries(identity).some(([key, value]) => root.transform[key as keyof RectTransformData] !== value);
  Object.assign(root.transform, identity);
  return changed;
}

export const AssetTypeSchema = z.enum(['texture', 'audio', 'font', 'json', 'scene', 'prefab']);

export type AssetType = z.infer<typeof AssetTypeSchema>;

export const AssetMetaSchema = z.object({
  id: z.string().min(1),
  type: AssetTypeSchema,
  path: z.string().min(1),
  bundle: z.string().optional(),
  /**
   * Original file extension (`png`, `svg`, `woff2`…).
   *
   * Loaders pick a parser from the URL extension, and a browser project hands
   * assets over as `blob:` URLs that have none — so the manifest carries the
   * extension the file actually had.
   */
  format: z.string().min(1).optional(),
});

export type AssetMeta = z.infer<typeof AssetMetaSchema>;

export const AssetManifestSchema = z.object({
  schemaVersion: z.number(),
  assets: z.array(AssetMetaSchema),
  scenePreloads: z
    .record(
      z.object({
        bundle: z.string().optional(),
        preload: z.array(z.string()).default([]),
      }),
    )
    .default({}),
});

export type AssetManifest = z.infer<typeof AssetManifestSchema>;

/* -------------------------------------------------------------------------- */
/* Project layout                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `pxe.config.json` — the marker file that turns a folder into a project.
 *
 * There is deliberately no `library/` or `temp/` directory at this stage: the
 * engine has no import pipeline, thumbnails or dependency graph yet, so there is
 * nothing to cache. Everything the editor generates lives in one place
 * (`.pxe/`) and is always rebuildable from `assets/`.
 */
export const projectConfigFileName = 'pxe.config.json';

/** Editor-generated project data: the asset database today, caches later. */
export const projectDataDirName = '.pxe';
export const assetDatabaseFileName = 'asset-db.json';
export const assetDatabasePath = `${projectDataDirName}/${assetDatabaseFileName}`;
export const componentDatabasePath = `${projectDataDirName}/component-db.json`;

export const defaultAssetsDirName = 'assets';
export const defaultScenesDirName = `${defaultAssetsDirName}/scenes`;

export const ProjectConfigSchema = z.object({
  name: z.string().min(1),
  /** Project-relative folder scanned for assets. */
  assets: z.string().min(1),
  components: z.string().min(1).default('src'),
  /** Project-relative path of the scene opened when the project loads. */
  startScene: z.string().min(1).optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export function createDefaultProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name: 'Untitled Project',
    assets: defaultAssetsDirName,
    components: 'src',
    ...overrides,
  };
}

/** Tolerant read: a missing or partial `pxe.config.json` falls back to defaults. */
export function parseProjectConfig(data: unknown, fallback: Partial<ProjectConfig> = {}): ProjectConfig {
  const base = createDefaultProjectConfig(fallback);
  const parsed = ProjectConfigSchema.partial().safeParse(data);

  if (!parsed.success) {
    return base;
  }

  const startScene = parsed.data.startScene ?? base.startScene;

  return {
    name: parsed.data.name ?? base.name,
    assets: normalizeProjectPath(parsed.data.assets ?? base.assets),
    components: normalizeProjectPath(parsed.data.components ?? base.components),
    ...(startScene ? { startScene: normalizeProjectPath(startScene) } : {}),
  };
}

export function serializeProjectConfig(config: ProjectConfig): string {
  return `${JSON.stringify(ProjectConfigSchema.parse(config), null, 2)}\n`;
}

/** `a//b`, `./a`, `a\b` → `a/b`; never keeps a leading or trailing slash. */
export function normalizeProjectPath(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter((part) => part.length > 0 && part !== '.').join('/');
}

export function projectPathJoin(...parts: string[]): string {
  return normalizeProjectPath(parts.join('/'));
}

export function projectPathDirName(path: string): string {
  const parts = normalizeProjectPath(path).split('/');
  parts.pop();
  return parts.join('/');
}

export function projectPathFileName(path: string): string {
  const parts = normalizeProjectPath(path).split('/');
  return parts[parts.length - 1] ?? '';
}

/* -------------------------------------------------------------------------- */
/* Asset database (`.pxe/asset-db.json`)                                       */
/* -------------------------------------------------------------------------- */

const textureExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'bmp', 'ico'];
const audioExtensions = ['mp3', 'ogg', 'wav', 'm4a', 'aac'];
const fontExtensions = ['ttf', 'otf', 'woff', 'woff2'];

export function assetExtension(path: string): string {
  const name = projectPathFileName(path);
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index + 1).toLowerCase() : '';
}

export function isSceneAssetPath(path: string): boolean {
  return /\.scene\.json$/i.test(path);
}

export function isPrefabAssetPath(path: string): boolean {
  return /\.prefab\.json$/i.test(path);
}

/** `null` means "not an asset" — the scanner lists it as ignored instead of guessing. */
export function inferAssetType(path: string): AssetType | null {
  const extension = assetExtension(path);

  if (extension === 'json') {
    if (isSceneAssetPath(path)) return 'scene';
    if (isPrefabAssetPath(path)) return 'prefab';
    return 'json';
  }

  if (textureExtensions.includes(extension)) return 'texture';
  if (audioExtensions.includes(extension)) return 'audio';
  if (fontExtensions.includes(extension)) return 'font';

  return null;
}

/** `assets/textures/player.png` → `player` */
export function assetDisplayName(path: string): string {
  const name = projectPathFileName(path);
  const index = name.indexOf('.');

  if (index > 0 && inferAssetType(path) !== null) {
    return isSceneAssetPath(path) || isPrefabAssetPath(path)
      ? name.split('.').slice(0, -2).join('.')
      : name.slice(0, index);
  }

  return name;
}

export const AssetRecordSchema = z.object({
  id: z.string().min(1),
  /** Project-relative path, e.g. `assets/textures/player.png`. */
  path: z.string().min(1),
  type: AssetTypeSchema,
});

export type AssetRecord = z.infer<typeof AssetRecordSchema>;

export const ASSET_DATABASE_SCHEMA_VERSION = 1;

export const AssetDatabaseSchema = z.object({
  schemaVersion: z.number(),
  assets: z.array(AssetRecordSchema),
});

export type AssetDatabase = z.infer<typeof AssetDatabaseSchema>;

export function createAssetDatabase(assets: AssetRecord[] = []): AssetDatabase {
  return { schemaVersion: ASSET_DATABASE_SCHEMA_VERSION, assets: [...assets].sort(compareAssetPath) };
}

export function emptyAssetDatabase(): AssetDatabase {
  return createAssetDatabase();
}

/** Tolerant read: a corrupt database degrades to "regenerate from assets/". */
export function parseAssetDatabase(data: unknown): AssetDatabase {
  const parsed = AssetDatabaseSchema.safeParse(data);
  return parsed.success ? createAssetDatabase(parsed.data.assets) : emptyAssetDatabase();
}

export function serializeAssetDatabase(database: AssetDatabase): string {
  return `${JSON.stringify(createAssetDatabase(database.assets), null, 2)}\n`;
}

export function compareAssetPath(a: AssetRecord, b: AssetRecord): number {
  return a.path.localeCompare(b.path);
}

/* -------------------------------------------------------------------------- */
/* Safe area                                                                   */
/* -------------------------------------------------------------------------- */

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const emptySafeArea: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function normalizeSafeArea(insets: Partial<SafeAreaInsets>): SafeAreaInsets {
  return {
    top: Math.max(0, insets.top ?? 0),
    right: Math.max(0, insets.right ?? 0),
    bottom: Math.max(0, insets.bottom ?? 0),
    left: Math.max(0, insets.left ?? 0),
  };
}

/* -------------------------------------------------------------------------- */
/* Migration                                                                   */
/* -------------------------------------------------------------------------- */

export type Migration = {
  from: number;
  to: number;
  migrate(data: unknown, reportWarning?: (message: string) => void): unknown;
};

/** Root node name that owns the design space of a scene. */
export const canvasNodeName = 'Canvas';

export const sceneMigrations: Migration[] = [
  { from: 2, to: 3, migrate: migrateV2ToV3 },
  {
    from: 1,
    to: 2,
    migrate: migrateV1ToV2,
  },
];

export function migrateToCurrentSchema(data: unknown, migrations: Migration[] = sceneMigrations, reportWarning = console.warn): unknown {
  const version = readSchemaVersion(data);
  let current = data;
  let currentVersion = version;

  while (currentVersion < CURRENT_SCHEMA_VERSION) {
    const migration = migrations.find((item) => item.from === currentVersion);

    if (!migration) {
      throw new Error(`Missing schema migration from version ${currentVersion}`);
    }

    current = migration.migrate(current, reportWarning);
    currentVersion = migration.to;
  }

  return current;
}

export function parseSceneData(data: unknown, migrations: Migration[] = sceneMigrations, reportWarning = console.warn): SceneData {
  return SceneSchema.parse(migrateToCurrentSchema(data, migrations, reportWarning));
}

/** The sole legacy field map. Unknown properties are deliberately preserved. */
const widgetAnchorFields: Record<string, string> = {
  alignLeft: 'anchorLeft', alignRight: 'anchorRight', alignTop: 'anchorTop', alignBottom: 'anchorBottom',
  alignHorizontalCenter: 'centerX', alignVerticalCenter: 'centerY',
  horizontalCenter: 'offsetX', verticalCenter: 'offsetY',
};

function migrateV2ToV3(data: unknown, reportWarning = console.warn): unknown {
  const scene = structuredClone(data) as SceneData;
  scene.schemaVersion = 3;
  const visit = (node: NodeData): void => {
    const hasAnchor = node.components.some((component) => component.type === 'engine.UIAnchor');
    node.components = node.components.flatMap((component) => {
      if (component.type !== 'engine.Widget') return [component];
      if (hasAnchor) {
        reportWarning(`Node ${node.id}: discarded legacy Widget because UIAnchor already exists`);
        return [];
      }
      return [{ ...component, type: 'engine.UIAnchor', props: Object.fromEntries(
        Object.entries(component.props).map(([key, value]) => [widgetAnchorFields[key] ?? key, value]),
      ) }];
    });
    node.children.forEach(visit);
  };
  visit(scene.root);
  return scene;
}

export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * v1 stored UI size and anchor inside an `engine.UITransform` component and
 * used a pixel pivot. v2 folds both into the node RectTransform and converts
 * the pivot to normalized coordinates.
 */
function migrateV1ToV2(data: unknown): unknown {
  const scene = structuredClone(data) as Record<string, unknown>;
  const settings = createDefaultSceneSettings();

  scene.schemaVersion = 2;
  scene.settings = settings;

  const visit = (node: Record<string, unknown>): void => {
    const components = Array.isArray(node.components) ? (node.components as Record<string, unknown>[]) : [];
    const ui = components.find((component) => component.type === 'engine.UITransform');
    const graphics = components.find((component) => component.type === 'engine.GraphicsRenderer');
    const sprite = components.find((component) => component.type === 'engine.SpriteRenderer');

    const uiProps = (ui?.props ?? {}) as Record<string, unknown>;
    const graphicsProps = (graphics?.props ?? {}) as Record<string, unknown>;
    const spriteProps = (sprite?.props ?? {}) as Record<string, unknown>;

    const transform = (node.transform ?? {}) as Record<string, unknown>;
    if (typeof transform.width !== 'number') {
      transform.width = pickSize(uiProps.width ?? graphicsProps.width ?? spriteProps.width);
    }
    if (typeof transform.height !== 'number') {
      transform.height = pickSize(uiProps.height ?? graphicsProps.height ?? spriteProps.height);
    }
    transform.pivotX = pickNumber(uiProps.anchorX, spriteProps.anchorX, 0);
    transform.pivotY = pickNumber(uiProps.anchorY, spriteProps.anchorY, 0);
    node.transform = transform;
    node.zIndex = typeof node.zIndex === 'number' ? node.zIndex : 0;
    node.components = components.filter((component) => component.type !== 'engine.UITransform');

    if (Array.isArray(node.children)) {
      for (const child of node.children as Record<string, unknown>[]) {
        visit(child);
      }
    }
  };

  const root = scene.root as Record<string, unknown> | undefined;

  if (root) {
    visit(root);
  }

  return scene;
}

function pickSize(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : defaultRectWidth;
}

function pickNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

function readSchemaVersion(data: unknown): number {
  if (!data || typeof data !== 'object' || !('schemaVersion' in data)) {
    throw new Error('Missing schemaVersion');
  }

  const value = (data as { schemaVersion: unknown }).schemaVersion;

  if (typeof value !== 'number') {
    throw new Error('schemaVersion must be a number');
  }

  if (value > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported schemaVersion ${value}`);
  }

  return value;
}
