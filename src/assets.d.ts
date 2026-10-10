declare module '*.yaml?raw' {
  const source: string;
  export default source;
}

declare module '*.md?raw' {
  const source: string;
  export default source;
}
