const path = require('node:path');
const { WebpackPlugin } = require('@electron-forge/plugin-webpack');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'LEU',
    icon: path.join(__dirname, 'assets/branding/app-icons/leu.ico'),
    appBundleId: 'org.leu.desktop',
    extraResource: [
      path.join(__dirname, 'target/x86_64-pc-windows-msvc/release/leu-engine.exe'),
      path.join(__dirname, 'LICENSE'),
      path.join(__dirname, 'PRIVACY.md'),
      path.join(__dirname, 'assets/branding/app-icons/leu.ico'),
    ],
    win32metadata: {
      CompanyName: 'LEU contributors',
      FileDescription: 'Light Electron Uninstaller',
    },
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['win32'] }],
  plugins: [
    new WebpackPlugin({
      mainConfig: './webpack.main.config.cjs',
      devContentSecurityPolicy:
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws://localhost:3000; object-src 'none'; base-uri 'none'",
      renderer: {
        config: './webpack.renderer.config.cjs',
        entryPoints: [
          {
            name: 'main_window',
            html: './src/renderer/index.html',
            js: './src/renderer/index.tsx',
            preload: { js: './src/preload/index.ts' },
            nodeIntegration: false,
          },
        ],
      },
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
