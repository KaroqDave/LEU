import type { LeuBridge } from './contracts/bridge';

declare global {
  const MAIN_WINDOW_WEBPACK_ENTRY: string;
  const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
  interface Window {
    leu: LeuBridge;
  }
}
declare module '*.css';
