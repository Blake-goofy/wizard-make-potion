interface Window {
  BarcodeDetector?: new (options?: { formats?: string[] }) => {
    detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
  };
}

declare module 'jsqr' {
  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
  ): { data: string } | null;
}
