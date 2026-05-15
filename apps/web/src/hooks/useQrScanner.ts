import { useCallback, useEffect, useRef, useState } from 'react';

type UseQrScannerOptions = {
  onScan: (value: string) => void | Promise<void>;
  cooldownMs?: number;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

export function useQrScanner(options: UseQrScannerOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastScanRef = useRef('');
  const lastScanAtRef = useRef(0);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUseTorch, setCanUseTorch] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  const stop = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsRunning(false);
    setCanUseTorch(false);
    setTorchEnabled(false);
  }, []);

  const decodeFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      animationRef.current = requestAnimationFrame(decodeFrame);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    let scannedValue: string;
    const Detector = window.BarcodeDetector as BarcodeDetectorConstructor | undefined;

    if (Detector) {
      const detector = new Detector({ formats: ['qr_code'] });
      const codes = await detector.detect(canvas);
      scannedValue = codes[0]?.rawValue ?? '';
    } else {
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const jsQrModule = await import('jsqr');
      scannedValue = jsQrModule.default(imageData.data, imageData.width, imageData.height)?.data ?? '';
    }

    const now = Date.now();
    const cooldownMs = options.cooldownMs ?? 3000;

    if (
      scannedValue &&
      (scannedValue !== lastScanRef.current || now - lastScanAtRef.current >= cooldownMs)
    ) {
      lastScanRef.current = scannedValue;
      lastScanAtRef.current = now;
      await options.onScan(scannedValue);
    }

    animationRef.current = requestAnimationFrame(decodeFrame);
  }, [options]);

  const start = useCallback(async () => {
    try {
      setError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not available in this browser. Open the HTTPS test URL in Safari or Chrome and allow camera permissions.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const [track] = stream.getVideoTracks();
      const capabilities = track?.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
      setCanUseTorch(Boolean(capabilities?.torch));
      setIsRunning(true);
      animationRef.current = requestAnimationFrame(decodeFrame);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Camera could not start.');
      stop();
    }
  }, [decodeFrame, stop]);

  const toggleTorch = useCallback(async () => {
    const [track] = streamRef.current?.getVideoTracks() ?? [];
    if (!track) return;

    await track.applyConstraints({ advanced: [{ torch: !torchEnabled } as MediaTrackConstraintSet] });
    setTorchEnabled((current) => !current);
  }, [torchEnabled]);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) stop();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [stop]);

  return { videoRef, isRunning, error, canUseTorch, torchEnabled, start, stop, toggleTorch };
}
