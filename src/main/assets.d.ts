/** electron-vite copies `?asset` imports into the build output and resolves the
 *  path at runtime (works in dev and inside the packaged asar). */
declare module "*?asset" {
  const src: string;
  export default src;
}
