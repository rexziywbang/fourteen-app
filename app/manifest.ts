import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fourteen",
    short_name: "Fourteen",
    description: "Anonymous crushes, true hints, and consent-first reveals.",
    start_url: "/home",
    display: "standalone",
    background_color: "#14101B",
    theme_color: "#14101B",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
