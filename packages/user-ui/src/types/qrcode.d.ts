declare module "qrcode" {
  export interface QRCodeToCanvasOptions {
    width?: number;
    margin?: number;
  }
  export function toCanvas(
    canvas: HTMLCanvasElement,
    text: string,
    options?: QRCodeToCanvasOptions
  ): Promise<void>;
  const _default: { toCanvas: typeof toCanvas };
  export default _default;
}
