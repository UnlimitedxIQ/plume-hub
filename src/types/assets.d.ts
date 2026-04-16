// Vite asset imports. Any of these extensions imported from TS resolves to
// a URL string at build time (fingerprinted + copied into dist by Vite).
// Mirrors @types/vite but scoped to what this project actually uses.

declare module '*.png' {
  const url: string
  export default url
}

declare module '*.jpg' {
  const url: string
  export default url
}

declare module '*.svg' {
  const url: string
  export default url
}

declare module '*.webp' {
  const url: string
  export default url
}
