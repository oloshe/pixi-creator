# Pixi Creator

基于 PixiJS v8 的轻量 H5 场景工具：编辑一份 Scene JSON，导出后放入网页。编辑器画布、Play 和静态播放器共用 Sprite / Text / Graphics 渲染器。

## 五分钟：一个页面 + 一个场景

```sh
pnpm install
pnpm build
pnpm dev:editor
```

1. 打开编辑器，点 **New Scene**，不需要建立工程。也可 **Open Scene JSON** 继续编辑已有文档。
2. 用 Hierarchy 的 UI Label / UI Panel / Sprite 预设添加节点，在 Inspector 修改内容。
3. 点 **Export Scene JSON** 下载 `scene.json`，点 **Copy embed snippet**。
4. 把 `packages/player/dist/pxe-player.js` 和 `scene.json` 放进同一发布目录，把嵌入片段粘进 `index.html`。如果使用了工作区资源，再原样复制 `assets/`（自定义资源目录则保留其目录名）。
5. 用 HTTP 静态服务器打开这个目录，例如 `python -m http.server 8080`。不使用 `file://`。

没有资源和自定义组件时，只需三行：

```html
<div id="scene" style="width:390px;height:844px"></div>
<script src="./pxe-player.js"></script>
<script>PxePlayer.mount('#scene', { scene: './scene.json' }).catch(console.error);</script>
```

工具栏生成的片段还会包含资源清单和项目组件编译结果，不依赖编辑器的 blob URL、源代码或 `.pxe/`。导出按钮只下载 Scene JSON；播放器文件和原始资源按上面说明复制。场景与资源数据相互独立，编辑器元数据不会写进 Scene JSON。

## 可选工作区

需要图片、字体、音频或项目脚本时，用 **Open Project** 打开目录，例如 `examples/demo-project`。

```text
my-page/
├── assets/                 图片、音频、字体、scenes/*.scene.json
├── src/components/         TypeScript + 可选 *.component.json
├── .pxe/                   可重建的 asset-db、component-db、编译快照
├── pxe.config.json
└── package.json            可选：项目自己的类型检查工具
```

```json
{ "name": "My Page", "assets": "assets", "components": "src", "startScene": "assets/scenes/Game.scene.json" }
```

打开时扫描资源和源码，忽略 node_modules、dist、.git、.pxe、点文件。源码不会进入 Assets Browser。缺省配置使用 assets / src；可读写目录会补写配置。File System Access API 直接写文件；目录选择回退路径为只读，保存下载 JSON，数据库缓存到 localStorage，外部新增/修改文件后重新选择文件夹。

编辑器也可以作为本地工具运行（`npx pxe web`）：当前目录即工作区，Hono 后端（`packages/cli`）在 127.0.0.1 提供文件读写、重命名/删除与外部编辑器启动（VSCode / Zed / Sublime / Notepad / 自定义命令）。

## 本地后端（CLI）

`packages/cli`（`@pxe/cli`）把编辑器打包成「React 静态前端 + Hono 本地后端」的单进程工具，取代原来的 Tauri 桌面外壳：

```sh
cd my-project
npx @pxe/cli web          # 或本地：node packages/cli/bin/pxe.mjs web
```

- **工作区**：`process.cwd()`（你执行命令的目录）就是打开的项目；`pxe.config.json` 缺失时会按缺省 `assets` / `src` 补写。
- **端口**：默认 `127.0.0.1:18118`，被占用则自动 `+1`（18119、18120…）。前端只用相对 `/api/*`，不感知端口。
- **安全**：只绑定回环地址，校验 `Origin` / `Host` 防止 CSRF 与 DNS rebinding（无 session token）。
- **文件沙箱**：`/api/fs/*` 拒绝绝对路径与 `..`，所有读写被限制在工作区内；外部编辑器通过白名单 action（`/api/system/open-editor`）启动，不做任意命令 API。
- **构建**：`pnpm build:web && pnpm copy:web && pnpm build:cli` 生成 `apps/editor/dist` → 复制进 `packages/cli/web` → 编译 `packages/cli/dist`。`pnpm dev:cli` 一条命令本地起服务（不自动开浏览器）。

前端通过 `apps/editor/src/lib/api.ts` 集中访问后端；`apps/editor/src/editor/backend.ts` 保持 backend 中立，纯浏览器（`vite dev` / 静态托管）仍可用 File System Access API 或 `<input webkitdirectory>` 选目录。

资源数据库按路径保留已有 assetId；节点只保存 `{ "assetId": "..." }`。移动资源可能改变 id，需要重新指定引用。Assets Browser 支持分组、拖放、复制引用、双击打开场景。**Rescan / Reload Components** 更新资源和组件。

编辑器的相机、选中节点、锁定、显示和视图偏好存入同目录的 `*.scene.editor.json`。派生数据库和编译快照统一放 `.pxe/`。

## Canvas、pivot 与布局

Canvas 是固定设计坐标系：x/y/rotation/pivot 为零，scale 为一，width/height 来自 Scene Settings。Inspector 和视口都锁定根节点几何变换；导入旧场景时会归一化并在状态栏提示。网格、裁剪、标尺和设备框基于这个坐标系。

需要整体移动、旋转、缩放时，添加 **Screen** 全屏容器并把内容放入其下。该节点以设计中心为 pivot，四边 UIAnchor 铺满画布，不包含渲染组件。选中容器后用 Move / Rotate / Scale 工具操作。变换同时调整布局边距，修改设计尺寸后仍保持对应的四边布局。

普通节点的 pivot 使用像素坐标（与 Pixi 的 `DisplayObject.pivot` 一致）。Inspector 数值和视口 pivot 拖拽共用补偿公式，含旋转与负 scale，改变原点不会移动画面。节点本地矩形从左上角 `(0,0)` 开始，+Y 向下。Sprite / Text 的锚点使用 0–1 归一化坐标，直接在组件里填写。

只有一个布局组件 **UIAnchor**：Left+Right 拉伸宽度，Top+Bottom 拉伸高度；同轴双边优先于居中，两轴独立，负缩放按镜像 pivot 计算。布局作用于父节点的未旋转矩形。拖动或 Inspector 变换会在同一步撤销记录中更新相应边距。

Scene JSON 当前为 **schema v4**。v1/v2/v3 自动迁移为 v4（v3 的归一化 pivot 会换算为像素 pivot）；旧 Widget 转为 UIAnchor 并保留未知 props；同节点已有 UIAnchor 时保留它、丢弃旧布局组件并警告。旧类型不再是可添加的有效组件类型。未知项目组件显示 `Missing component type`，其数据保存/重开保持不变。

Hierarchy 顺序是日常排序入口；Layer / zIndex 保留排序能力，放在 Inspector 默认折叠的 **Advanced** 中。

## 项目组件

参考 `examples/demo-project/src/components/MoveComponent.ts` 和 `src/README.md`：

```ts
import { Component, defineComponent, prop } from '@pxe/runtime';
class Move extends Component {
  speed = 100;
  update(dt: number) { this.node.x += this.speed * dt; }
}
export default defineComponent({
  type: 'game.move', displayName: 'Move', category: 'Game', ctor: Move,
  properties: { speed: prop.number({ default: 100 }) },
});
```

也支持 `export const components = [...]`。浏览器在 Worker 内用 Sucrase 转换 TS，并求值导出的 metadata；不做类型检查，不实例化 Behavior。只有 Play iframe / 静态宿主会创建组件实例并执行生命周期。编辑器 store 和 component-db 只存 JSON metadata，永远没有 ctor。

支持相对源码导入与 `@pxe/runtime` 的 Component / defineComponent / prop；不解析第三方 npm 包、CSS 或 JSON import。模块顶层应只定义类型和组件，不能访问 DOM 或节点。每个组件可配一份 `*.component.json` 作为零编译 metadata；编译失败时仍能编辑这些字段。重复/保留类型、无效属性、编译错误会明确报告。新增、删除、切换工作区都会刷新清单，关闭后恢复内置组件。

打开、手动 Reload 和每次 Play 前重建；不使用 watcher。Play 比较 metadata 与运行时注册类型，差异显示在状态栏；侧车内容与源码 metadata 不一致也会警告。校验示例或指定项目：

```sh
pnpm check:components
pnpm check:components C:/path/to/project
```

源码重命名不会改变组件 type/id；删除代码也不会删除场景上的组件数据。修改 type 是数据模型变更，需要同步已有场景。

项目组件在调色板支持右键菜单（重命名 / 在外部编辑器打开 / 删除）与双击打开（使用「设置」中的默认编辑器）。浏览器不做类型检查；要让你自己的 IDE/`tsc` 解析 `@pxe/runtime`，用「资源 → 生成类型定义…」在工程内写入 `src/pxe-runtime.d.ts`（ambient 模块声明），**不生成、不修改 tsconfig.json**。

## 静态播放器 API

`packages/player/dist/pxe-player.js` 为单文件 IIFE，公开 `PxePlayer.mount(target, options)`；`pxe-player.mjs` 为 ES 模块版本。构建包含 Pixi，不需要额外 CDN。

- target：CSS 选择器或 HTMLElement。
- scene：SceneData 或 scene.json URL。
- assets：AssetManifest 或 JSON URL。资源路径相对 scene.json 所在目录解析；scene 为对象时可指定 baseUrl。
- width / height：可选固定 CSS 尺寸；缺省通过 ResizeObserver 跟随宿主。
- resizeMode：contain / cover / fixed-width / fixed-height / stretch。
- components：直接注册的 ComponentDefinition；modules：预编译项目模块数组或 JSON URL。
- 返回 `Promise<Game>`，可 pause、resume、resize、destroy；destroy 会解绑尺寸观察并移除画布。

Play iframe 只负责传递场景、资源和组件快照、控制暂停及转发日志，渲染与静态页面使用同一个 mount。

## 渲染与编辑

`packages/schema` 定义场景格式与迁移；`editor-core` 负责 Command / History / 选择与元数据；`rendering` 只依赖 Pixi 与 schema；`runtime` 负责 Game / GameNode / 布局和组件；`player` 是静态宿主。

编辑器 PreviewNode 只创建注册的 RendererView，按 component id 复用。Sprite 支持 native/custom/stretch/contain/cover、tint/alpha/blendMode；Text 支持字体资源、换行、对齐、描边、阴影；Graphics 支持矩形、圆角、椭圆、圆、多边形。运行时和编辑器使用同一份渲染实现。

Scene Settings 决定设计尺寸、背景、resizeMode 与裁剪。Device 预览、Grid、Safe Area、Show Overflow 只改变编辑器视图；相机缩放不修改场景。F 定位选中、Shift+F 全部、1 为 100%、2 适配画布；V/W/E/R/Y 切换工具；Ctrl/Cmd+Z 撤销，Ctrl/Cmd+S 保存。

编辑器界面默认简体中文，可在顶部菜单「语言 / Language」切换。顶部为 macOS 风格菜单栏（文件 / 编辑 / 资源），Undo/Redo 在「编辑」中；工具按钮带图标。选择 / 移动 / 旋转 / 缩放 / 轴心工具沿用 Cocos 交互：移动与缩放显示红绿坐标轴手柄，旋转显示圆形旋转环并支持 15° 吸附，可沿单轴约束拖动。Hierarchy 右键弹出菜单支持重命名 / 复制 / 粘贴为子节点 / 删除。Inspector 的资源字段是通用可搜索选择器（按名称、路径或 asset-id 过滤）。Assets Browser 的纹理显示实时缩略图，选中项的详情卡悬浮跟随滚动并吸附面板边缘。

「资源 → 新建组件脚本…」会按输入名生成 `src/components/<Name>.ts` 模板并自动重扫进调色板。事件绑定在代码中完成：内置 `engine.Button` 发出 `click/pointerDown/pointerUp`，项目组件在 `onLoad` 里用 `this.node.getComponent(Button)` 或 `componentRef` 属性订阅（见 `examples/demo-project/src/README.md`）。

## 设计红线

Scene JSON 是场景数据的唯一来源，编辑器状态不进入其中；ctor 不进入编辑器状态。所有派生数据放 `.pxe/`，不新增 library/temp 管线。新增能力前先确认服务的是页面还是大型工程。

不做 Prefab/嵌套 Prefab、资源 importer pipeline（纹理尺寸/音频时长/Spine/Atlas 预处理）、hash/依赖图、增量构建/构建缓存、逐资源 .meta 侧车、Native Bridge、Percent 边距、跨父级 Anchor target。纹理在 Assets Browser 直接显示 `blob:` 实时缩略图（复用 ProjectSession 的 URL 缓存，懒加载，无降采样缓存管线）。页面通过复制节点和静态文件发布。

## 验证

```sh
pnpm build                      # 全项目类型检查 + 静态播放器构建
pnpm test                       # 数学、迁移、布局、资源、组件、编辑器与播放器路径
pnpm --filter @pxe/editor build  # 编辑器和 Worker 生产构建
pnpm check:components           # 示例组件 metadata 与源码一致性
pnpm build:web && pnpm copy:web && pnpm build:cli   # 打包本地 CLI
npx pxe web                     # 冒烟：127.0.0.1 起服务并打开浏览器
```

浏览器回归以编辑器、Play、HTTP 静态页的 Pixi 类名、transform、pivot 和 text style 逐项对比，进度记录在 `progress.md`。开发模式提供 `window.__pxeEditor.store`、`window.__pxeSceneView`、Play 内 `window.__pxeGame` 便于验证。
