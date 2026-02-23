interface ComputerScreenshotProps {
  screenshotUrl: string | null;
}

const ComputerScreenshot = ({ screenshotUrl }: ComputerScreenshotProps) => {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 600 }}>
      {/* Screen content area — aligned to the white screen opening of the laptop frame */}
      <div
        style={{
          position: "absolute",
          top: "3.8%",
          left: "10.2%",
          width: "79.6%",
          height: "73.5%",
          borderRadius: "6px 6px 0 0",
          overflow: "hidden",
          background: "#111",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1,
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
