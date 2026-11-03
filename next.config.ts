import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Render titles, descriptions, canonical/hreflang links and Open Graph tags
  // in <head> for every visitor and crawler (search engines, AI crawlers and
  // link previews), instead of streaming them into <body> for "JS-capable" agents.
  htmlLimitedBots: /.*/,
};

export default nextConfig;
