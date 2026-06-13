import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "myMakaranta",
    short_name: "Makaranta",
    description: "School management, crafted for Nigerian schools.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F5F7",
    theme_color: "#4338CA",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
