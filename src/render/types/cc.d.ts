/**
 * Cocos Creator 3.8 最小类型桩（render/ 层专用）
 *
 * 用途：本项目当前无 Cocos Creator 工程环境，render/ 层骨架需要 `import { ... } from 'cc'`
 * 才能编写 cc.Graphics 代码绘制逻辑。本声明提供用到的 cc API 最小子集，让 `npx tsc --noEmit`
 * 在无 cc 真实类型时也能通过类型校验。
 *
 * 未来正式接入 Cocos Creator 3.8 工程时：
 * - 删除本文件
 * - tsconfig.json 加入 `"types": []`，由 Cocos Creator 编辑器自动注入真实 cc 类型
 * - 骨架代码无需修改（API 表面完全对齐 Cocos Creator 3.8 官方类型）
 *
 * 声明原则：
 * - 仅声明骨架用到的类与方法（避免维护成本）
 * - 方法签名尽量宽松（unknown / any 兜底），真实类型由 Cocos Creator 接入后接管
 * - 装饰器 _decorator.ccclass / property 仅占位
 */
declare module 'cc' {
  export type UnknownArg = unknown;

  /** 通用颜色（RGBA 0-1 浮点） */
  export class Color {
    r: number;
    g: number;
    b: number;
    a: number;
    constructor(r?: number, g?: number, b?: number, a?: number);
    clone(): Color;
    static readonly WHITE: Color;
    static readonly BLACK: Color;
    static readonly RED: Color;
    static readonly GREEN: Color;
    static readonly BLUE: Color;
    static readonly YELLOW: Color;
    static readonly CYAN: Color;
    static readonly GRAY: Color;
    static readonly TRANSPARENT: Color;
  }

  /** 3D 向量 */
  export class Vec3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    static readonly ZERO: Vec3;
    static readonly ONE: Vec3;
  }

  /** 2D 向量 */
  export class Vec2 {
    x: number;
    y: number;
    constructor(x?: number, y?: number);
  }

  /** 节点变换 */
  export class UITransform extends Component {
    contentSize: Size;
    anchorX: number;
    anchorY: number;
    setContentSize(width: number, height: number): void;
    setAnchorPoint(x: number, y: number): void;
  }

  /** 尺寸 */
  export class Size {
    width: number;
    height: number;
    constructor(width?: number, height?: number);
  }

  /** 对齐策略 */
  export class Widget extends Component {
    top: number;
    bottom: number;
    left: number;
    right: number;
    horizontalCenter: number;
    verticalCenter: number;
    isAlignTop: boolean;
    isAlignBottom: boolean;
    isAlignLeft: boolean;
    isAlignRight: boolean;
    isAlignHorizontalCenter: boolean;
    isAlignVerticalCenter: boolean;
    alignMode: number;
  }

  /** Graphics 代码绘制（技术设计文档 7.4：UI 以代码绘制为主） */
  export class Graphics extends Component {
    lineWidth: number;
    strokeColor: Color;
    fillColor: Color;
    fillRange: number;
    miterLimit: number;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
    quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
    arc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
    ellipse(cx: number, cy: number, rx: number, ry: number): void;
    circle(cx: number, cy: number, r: number): void;
    rect(x: number, y: number, w: number, h: number): void;
    roundRect(x: number, y: number, w: number, h: number, r: number): void;
    fill(): void;
    stroke(): void;
    clear(): void;
    close(): void;
  }

  /** 文本标签 */
  export class Label extends Component {
    string: string;
    fontSize: number;
    color: Color;
    lineHeight: number;
    horizontalAlign: number;
    verticalAlign: number;
    overflow: number;
    enableOutline: boolean;
    outlineColor: Color;
    outlineWidth: number;
    enableWrapText: boolean;
    isBold: boolean;
    cacheMode: number;
  }

  /** 按钮 */
  export class Button extends Component {
    transition: number;
    normalColor: Color;
    pressedColor: Color;
    hoveredColor: Color;
    disabledColor: Color;
    pressedSprite: Sprite | null;
    hoveredSprite: Sprite | null;
    normalSprite: Sprite | null;
    clickEvents: EventHandler[];
    /** 是否可交互（false=灰化不响应点击） */
    interactable: boolean;
  }

  /** 事件处理器 */
  export class EventHandler {
    target: Node | null;
    component: string;
    handler: string;
    customEventData: string;
  }

  /** Sprite（骨架用 Graphics 为主，Sprite 仅占位） */
  export class Sprite extends Component {
    spriteFrame: unknown;
    type: number;
    sizeMode: number;
    color: Color;
  }

  /** Layout 自动布局（用于面板内子节点排列） */
  export class Layout extends Component {
    type: number;
    spacingX: number;
    spacingY: number;
    horizontalDirection: number;
    verticalDirection: number;
    resizeMode: number;
    padding: number;
  }

  /** 组件基类 */
  export class Component {
    node: Node;
    enabled: boolean;
    name: string;
    onLoad(): void;
    start(): void;
    onEnable(): void;
    onDisable(): void;
    onDestroy(): void;
    update(dt: number): void;
    scheduleOnce(callback: () => void, delay?: number): void;
    unschedule(callback: () => void): void;
  }

  /** 场景图节点 */
  export class Node {
    name: string;
    active: boolean;
    parent: Node | null;
    children: Node[];
    position: Vec3;
    scale: Vec3;
    angle: number;
    layer: number;
    constructor(name?: string);
    addChild(child: Node): void;
    removeChild(child: Node): void;
    removeFromParent(): void;
    addComponent<T extends Component>(cls: new () => T): T;
    getComponent<T extends Component>(cls: new () => T): T | null;
    getComponents<T extends Component>(cls: new () => T): T[];
    setPosition(x: number, y: number, z?: number): void;
    setScale(sx: number, sy?: number, sz?: number): void;
    getContentSize(): Size;
    setContentSize(width: number, height: number): void;
    on(type: string, callback: (...args: unknown[]) => void, target?: unknown): void;
    off(type: string, callback?: (...args: unknown[]) => void, target?: unknown): void;
    emit(type: string, ...args: unknown[]): void;
    destroy(): void;
    isValid: boolean;
  }

  /** 场景 */
  export class Scene extends Node {
    constructor(name?: string);
  }

  /** 导演（场景切换） */
  export const director: {
    getScene(): Scene | null;
    runScene(scene: Scene): void;
    loadScene(name: string): void;
    getDeltaTime(): number;
  };

  /** 视图/屏幕 */
  export const view: {
    getVisibleSize(): Size;
    getCanvasSize(): Size;
    setDesignResolutionSize(width: number, height: number, resolutionPolicy: number): void;
  };

  export const screen: {
    windowSize: Size;
  };

  /** 层级常量 */
  export const Layers: {
    Enum: {
      UI_2D: number;
      UI_3D: number;
      DEFAULT: number;
      GIZMOS: number;
      EDITOR: number;
    };
  };

  /** 装饰器 */
  export namespace _decorator {
    function ccclass(name?: string): ClassDecorator;
    function property(options?: UnknownArg | unknown): PropertyDecorator;
  }

  /** 数学工具 */
  export namespace math {
    export function clamp(v: number, min: number, max: number): number;
    export function lerp(a: number, b: number, t: number): number;
  }

  /** UI 透明度组件 */
  export class UIOpacity extends Component {
    opacity: number;
  }

  /** Tween 实例 */
  export class Tween<T> {
    to(duration: number, props: Partial<T>, opts?: { easing?: string }): Tween<T>;
    union(): Tween<T>;
    repeatForever(): Tween<T>;
    start(): Tween<T>;
    stop(): Tween<T>;
  }

  /** tween 工厂函数 */
  export function tween<T>(target: T): Tween<T>;
}

/** 浏览器 RAF（骨架阶段由 cc.d.ts 提供，正式接入 Cocos 后由平台注入） */
declare function requestAnimationFrame(cb: (ts: number) => void): number;
declare function cancelAnimationFrame(handle: number): void;
