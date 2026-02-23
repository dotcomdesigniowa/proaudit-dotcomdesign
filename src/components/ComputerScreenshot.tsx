import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

/**
 * Calibrated screen-cutout values (percentage of the frame container).
 * Tune these via ?calibrate=1 on an audit page, then paste the values here.
 */
export const SCREEN_CALIBRATION = {
  top: 12,
  left: 19.8,
  width: 60.5,
  height: 54,
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
