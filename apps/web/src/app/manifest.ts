import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Koranco Farms",
    short_name: "Koranco",
    description: "Koranco Farms field operations",
    start_url: "/attendance",
    display: "standalone",
    background_color: "#f5f3ea",
    theme_color: "#173f2a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
