export default {
  output: "standalone",
  // sanitize-html's dependency chain (htmlparser2) is ESM-only and used
  // exclusively from server-side API routes — mark it external so webpack
  // doesn't try to bundle it into the route's CJS output at all.
  experimental: { serverComponentsExternalPackages: ["sanitize-html"] },
};
