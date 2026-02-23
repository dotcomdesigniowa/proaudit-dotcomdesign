interface ComputerScreenshotProps {
  screenshotUrl: string | null;
}

const ComputerScreenshot = ({ screenshotUrl }: ComputerScreenshotProps) => {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 520 }}>
      {/* Screen content area — aligned to the white screen opening of the laptop frame */}
      <div
        style={{
          position: "absolute",
          top: "5.5%",
          left: "12.5%",
          width: "75%",
          height: "68%",
          borderRadius: "3px 3px 0 0",
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
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }}
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
