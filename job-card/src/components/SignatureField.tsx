"use client";

import { useEffect, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

/** Signature pad. Emits a Base64 PNG data URL after every stroke, or undefined when cleared. */
export function SignatureField({
  initial,
  onChange,
}: {
  /** Existing signature (when editing a saved job card). */
  initial?: string;
  onChange: (dataUrl: string | undefined) => void;
}) {
  const padRef = useRef<SignatureCanvas>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Size the canvas to its container at device pixel ratio so strokes stay crisp.
  useEffect(() => {
    const resize = () => {
      const pad = padRef.current;
      const wrap = wrapRef.current;
      if (!pad || !wrap) return;
      const canvas = pad.getCanvas();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.isEmpty() ? null : pad.toData();
      canvas.width = wrap.clientWidth * ratio;
      canvas.height = wrap.clientHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      if (data) pad.fromData(data);
    };
    resize();
    // Draw a previously captured signature back onto the pad.
    if (initial && padRef.current && wrapRef.current) {
      void padRef.current.fromDataURL(initial, {
        width: wrapRef.current.clientWidth,
        height: wrapRef.current.clientHeight,
      });
    }
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // Only on mount: later strokes are reported through onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div ref={wrapRef} className="h-48 w-full overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white dark:border-slate-600">
        <SignatureCanvas
          ref={padRef}
          penColor="#0f172a"
          backgroundColor="rgb(255,255,255)"
          canvasProps={{ className: "h-full w-full touch-none", "aria-label": "Client signature pad" }}
          onEnd={() => onChange(padRef.current?.getCanvas().toDataURL("image/png"))}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Client signs inside the box</span>
        <button
          type="button"
          className="rounded-lg px-3 py-2 text-sm font-medium text-blue-700 dark:text-blue-300"
          onClick={() => {
            padRef.current?.clear();
            onChange(undefined);
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
