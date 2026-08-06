import { ImageResponse } from "next/og";

export const alt = "Fourteen at Michigan";
export const contentType = "image/png";

export function generateImageMetadata() {
  return [
    { id: "unfurl", alt, contentType, size: { width: 1200, height: 630 } },
    { id: "story", alt, contentType, size: { width: 1080, height: 1920 } },
  ];
}

export default async function OpenGraphImage({ id }: { id: Promise<string> | string }) {
  const imageId = await id;
  const story = imageId === "story";
  const size = story ? { width: 1080, height: 1920 } : { width: 1200, height: 630 };
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", alignItems: "center", justifyContent: "center", background: "#14101b", color: "#f2eef7", fontFamily: "Georgia, serif" }}>
      <div style={{ position: "absolute", width: story ? 850 : 600, height: story ? 850 : 600, borderRadius: 999, background: "rgba(231,90,128,.15)", filter: "blur(90px)" }} />
      <div style={{ position: "absolute", inset: 48, display: "flex", border: "1px solid rgba(255,255,255,.1)", borderRadius: 36 }} />
      <div style={{ display: "flex", position: "relative", width: story ? "78%" : "84%", height: story ? "74%" : "68%", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: story ? 54 : 42 }}><span style={{ display: "flex", width: story ? 74 : 60, height: story ? 74 : 60, alignItems: "center", justifyContent: "center", borderRadius: 20, background: "#e75a80", fontSize: story ? 34 : 26 }}>♥</span><span>fourteen</span></div>
        <div style={{ display: "flex", maxWidth: story ? 820 : 880, flexDirection: "column", gap: 28 }}>
          <div style={{ color: "#e75a80", fontFamily: "Arial, sans-serif", fontSize: story ? 24 : 18, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase" }}>University of Michigan</div>
          <div style={{ fontSize: story ? 104 : 72, fontStyle: "italic", lineHeight: 1.04, letterSpacing: "-.035em" }}>Someone has a crush on someone at Michigan.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#b5acc6", fontFamily: "Arial, sans-serif", fontSize: story ? 26 : 19 }}><span>One a week</span><span>Fourteen true hints</span><span>Consent-first reveals</span></div>
      </div>
    </div>,
    size,
  );
}
