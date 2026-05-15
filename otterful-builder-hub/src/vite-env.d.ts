/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * When the hub runs on another origin (e.g. a preview URL) but `/builder/models/*` is only deployed on
   * production, set this to that production origin so GLBs and locomotion clips resolve. Example:
   * `https://www.otterfulotters.xyz`
   */
  readonly VITE_PUBLIC_ASSET_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
