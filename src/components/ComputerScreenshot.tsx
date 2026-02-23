import { useState, useEffect, useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

/**
 * Calibrated screen-cutout values (percentage of the frame container).
 * Tune these via ?calibrate=1 on an audit page, then paste the values here.
 */
export const SCREEN_CALIBRATION = {
  top: 17.6,
  left: 16.3,
  width: 67.3,
  height: 63.1,
} as const;

interface ComputerScreenshotProps {
  screenshotUrl: string | null;
  calibrate?: boolean;
}

const ComputerScreenshot = ({ screenshotUrl, calibrate = false }: ComputerScreenshotProps) => {
  const [topPct, setTopPct] = useState<number>(SCREEN_CALIBRATION.top);
  const [leftPct, setLeftPct] = useState<number>(SCREEN_CALIBRATION.left);
  const [widthPct, setWidthPct] = useState<number>(SCREEN_CALIBRATION.width);
  const [heightPct, setHeightPct] = useState<number>(SCREEN_CALIBRATION.height);

  // Auto-detect transparent area of the frame image
  useEffect(() => {
    if (!calibrate) return;
    const img = new Image();
    img.src = "/images/computer-frame.png";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const w = canvas.width, h = canvas.height;
      const isOpaque = (x: number, y: number) => data[(y * w + x) * 4 + 3] > 128;
      
      // Strategy: scan the center row/column to find the inner transparent gap
      // Center row: background(trans) -> bezel(opaque) -> screen(trans) -> bezel(opaque) -> background(trans)
      const midY = Math.floor(h * 0.45); // scan slightly above center (screen area)
      const midX = Math.floor(w * 0.5);
      
      // Find screen left/right by scanning horizontal center
      let screenLeft = 0, screenRight = w;
      // From left: skip transparent bg, skip opaque bezel, find transparent screen start
      let x = 0;
      while (x < w && !isOpaque(x, midY)) x++; // skip transparent background
      while (x < w && isOpaque(x, midY)) x++;  // skip opaque left bezel
      screenLeft = x;
      // Continue to find where screen ends (opaque right bezel starts)
      while (x < w && !isOpaque(x, midY)) x++;
      screenRight = x;
      
      // Find screen top/bottom by scanning vertical center
      let screenTop = 0, screenBottom = h;
      let y = 0;
      while (y < h && !isOpaque(midX, y)) y++; // skip transparent background
      while (y < h && isOpaque(midX, y)) y++;  // skip opaque top bezel
      screenTop = y;
      while (y < h && !isOpaque(midX, y)) y++;
      screenBottom = y;
      
      if (screenRight > screenLeft && screenBottom > screenTop) {
        // Add a small 1% inset to avoid bezel edge artifacts
        const inset = 0.3;
        const detectedTop = (screenTop / h) * 100 + inset;
        const detectedLeft = (screenLeft / w) * 100 + inset;
        const detectedWidth = ((screenRight - screenLeft) / w) * 100 - inset * 2;
        const detectedHeight = ((screenBottom - screenTop) / h) * 100 - inset * 2;
        
        console.log("Auto-detected screen cutout:", {
          top: detectedTop.toFixed(1),
          left: detectedLeft.toFixed(1),
          width: detectedWidth.toFixed(1),
          height: detectedHeight.toFixed(1),
          raw: { screenLeft, screenRight, screenTop, screenBottom, imgW: w, imgH: h }
        });
        
        setTopPct(parseFloat(detectedTop.toFixed(1)));
        setLeftPct(parseFloat(detectedLeft.toFixed(1)));
        setWidthPct(parseFloat(detectedWidth.toFixed(1)));
        setHeightPct(parseFloat(detectedHeight.toFixed(1)));
      }
    };
  }, [calibrate]);

  const screen = calibrate
    ? { top: topPct, left: leftPct, width: widthPct, height: heightPct }
    : SCREEN_CALIBRATION;

  const copyValues = () => {
    const text = [
      `SCREEN_TOP=${screen.top.toFixed(1)}%`,
      `SCREEN_LEFT=${screen.left.toFixed(1)}%`,
      `SCREEN_WIDTH=${screen.width.toFixed(1)}%`,
      `SCREEN_HEIGHT=${screen.height.toFixed(1)}%`,
    ].join("\n");
    navigator.clipboard.writeText(text);
  };

  return (
    <div>
      {/* Laptop frame + screenshot */}
      <div style={{ position: "relative", width: "100%", maxWidth: 600 }}>
        {/* Screen content area */}
        <div
          style={{
            position: "absolute",
            top: `${screen.top}%`,
            left: `${screen.left}%`,
            width: `${screen.width}%`,
            height: `${screen.height}%`,
            borderRadius: "3px 3px 0 0",
            overflow: "hidden",
            background: "#111",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1,
            ...(calibrate ? { border: "2px solid #ff0066" } : {}),
          }}
        >
          {screenshotUrl ? (
            <img
              src={screenshotUrl}
              alt="Website screenshot"
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "top",
                display: "block",
              }}
            />
          ) : (
            <span style={{ color: "#888", fontSize: 14, fontFamily: "monospace" }}>
              Generating screenshot…
            </span>
          )}
        </div>
        {/* Frame overlay */}
        <img
          src="/images/computer-frame.png"
          alt="Computer frame"
          style={{
            width: "100%",
            display: "block",
            position: "relative",
            zIndex: 2,
            pointerEvents: calibrate ? "none" : undefined,
          }}
        />
      </div>

      {/* Calibration controls — only in calibrate mode */}
      {calibrate && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 12,
            background: "#1a1a2e",
            color: "#e0e0e0",
            fontFamily: "monospace",
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 12, fontSize: 14, color: "#ff0066" }}>
            🔧 CALIBRATION MODE
          </div>

          {[
            { label: "Top", value: topPct, set: (v: number) => setTopPct(v), min: 0, max: 60 },
            { label: "Left", value: leftPct, set: (v: number) => setLeftPct(v), min: 0, max: 60 },
            { label: "Width", value: widthPct, set: (v: number) => setWidthPct(v), min: 30, max: 100 },
            { label: "Height", value: heightPct, set: (v: number) => setHeightPct(v), min: 20, max: 80 },
          ].map(({ label, value, set, min, max }) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>{label}</span>
                <span style={{ color: "#ff0066", fontWeight: 700 }}>{value.toFixed(1)}%</span>
              </div>
              <Slider
                min={min}
                max={max}
                step={0.1}
                value={[value]}
                onValueChange={([v]) => set(v)}
              />
            </div>
          ))}

          <pre
            style={{
              marginTop: 14,
              padding: 10,
              background: "#0d0d1a",
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.6,
              userSelect: "all",
            }}
          >
{`SCREEN_TOP=${topPct.toFixed(1)}%
SCREEN_LEFT=${leftPct.toFixed(1)}%
SCREEN_WIDTH=${widthPct.toFixed(1)}%
SCREEN_HEIGHT=${heightPct.toFixed(1)}%`}
          </pre>

          <Button
            size="sm"
            variant="outline"
            onClick={copyValues}
            style={{ marginTop: 10, fontFamily: "monospace", fontSize: 12 }}
          >
            📋 Copy Values
          </Button>
        </div>
      )}
    </div>
  );
};

export default ComputerScreenshot;
