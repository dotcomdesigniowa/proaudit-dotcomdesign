interface ComputerScreenshotProps {
  screenshotUrl: string | null;
}

const ComputerScreenshot = ({ screenshotUrl }: ComputerScreenshotProps) => {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 600 }}>
      {/* Screen content area — positioned to align with the transparent screen opening */}
      <div
        style={{
          position: "absolute",
          top: "5.5%",
          left: "12%",
          width: "76%",
          height: "60%",
          borderRadius: 4,
          overflow: "hidden",
          background: "#111",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {screenshotUrl ? (
          <img
            src={screenshotUrl}
            alt="Website screenshot"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
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
        style={{ width: "100%", display: "block", position: "relative", zIndex: 2 }}
      />
    </div>
  );
};

export default ComputerScreenshot;
