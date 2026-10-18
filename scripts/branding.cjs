// Render the editable SVG sources with the project's existing Electron runtime.
// No image service, external fonts, or additional build dependencies are required.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const brand = path.join(root, 'assets/branding');
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256, 512, 1024];

if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [__filename], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  child.on('error', (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    if (code !== 0) console.error(`Electron asset exporter exited with status ${code}.`);
    process.exitCode = code === 0 ? 0 : 1;
  });
} else {
  const { app, BrowserWindow } = require('electron');
  app.setPath('userData', path.join(root, '.cache/branding-electron'));
  app.disableHardwareAcceleration();
  const timeout = setTimeout(() => {
    console.error('Brand export timed out.');
    app.exit(1);
  }, 30000);

  app
    .whenReady()
    .then(async () => {
      const output = path.join(brand, 'app-icons');
      const iconDir = path.join(brand, 'icons');
      await fs.mkdir(output, { recursive: true });
      await fs.mkdir(iconDir, { recursive: true });
      const icons = JSON.parse(await fs.readFile(path.join(brand, 'ui-icons.json'), 'utf8'));
      const style =
        'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
      const symbols = [];
      for (const [name, d] of Object.entries(icons)) {
        const body = `<path d="${d}"/>`;
        await fs.writeFile(
          path.join(iconDir, `${name}.svg`),
          `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${style}><title>${name}</title>${body}</svg>\n`,
        );
        symbols.push(`<symbol id="${name}" viewBox="0 0 24 24" ${style}>${body}</symbol>`);
      }
      await fs.writeFile(
        path.join(brand, 'ui-icons.svg'),
        `<svg xmlns="http://www.w3.org/2000/svg"><defs>${symbols.join('')}</defs></svg>\n`,
      );

      const win = new BrowserWindow({
        width: 1440,
        height: 1120,
        useContentSize: true,
        frame: false,
        show: false,
        webPreferences: {
          offscreen: true,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      await win.loadURL('data:text/html,<html><body></body></html>');
      const svg = await fs.readFile(path.join(brand, 'leu-icon.svg'), 'utf8');
      const images = await win.webContents.executeJavaScript(`(async () => {
      const image = new Image();
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)});
      await image.decode();
      return ${JSON.stringify(sizes)}.map(size => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, size, size);
        return { size, data: canvas.toDataURL('image/png').split(',')[1] };
      });
    })()`);
      const frames = images.map(({ size, data }) => ({ size, data: Buffer.from(data, 'base64') }));
      for (const { size, data } of frames) {
        await fs.writeFile(path.join(output, `leu-${size}.png`), data);
      }

      for (const name of ['leu-mark', 'leu-logo-light', 'leu-logo-dark', 'leu-logo-mono']) {
        const source = await fs.readFile(path.join(brand, `${name}.svg`), 'utf8');
        const data = await win.webContents.executeJavaScript(`(async () => {
        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(source)});
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth * 4;
        canvas.height = image.naturalHeight * 4;
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png').split(',')[1];
      })()`);
        await fs.writeFile(path.join(brand, `${name}.png`), Buffer.from(data, 'base64'));
      }

      // Windows 11 supports PNG-compressed ICO frames, including high-DPI sizes.
      const icoFrames = frames.filter(({ size }) => size <= 256);
      const header = Buffer.alloc(6 + icoFrames.length * 16);
      header.writeUInt16LE(1, 2);
      header.writeUInt16LE(icoFrames.length, 4);
      let offset = header.length;
      icoFrames.forEach(({ size, data }, index) => {
        const entry = 6 + index * 16;
        header[entry] = header[entry + 1] = size === 256 ? 0 : size;
        header.writeUInt16LE(1, entry + 4);
        header.writeUInt16LE(32, entry + 6);
        header.writeUInt32LE(data.length, entry + 8);
        header.writeUInt32LE(offset, entry + 12);
        offset += data.length;
      });
      await fs.writeFile(
        path.join(output, 'leu.ico'),
        Buffer.concat([header, ...icoFrames.map(({ data }) => data)]),
      );

      await win.loadFile(path.join(brand, 'preview.html'));
      await win.webContents.executeJavaScript(`Promise.all([
      document.fonts.ready,
      ...Array.from(document.images, image => image.decode()),
    ])`);
      const preview = await win.webContents.capturePage();
      await fs.writeFile(path.join(brand, 'brand-preview.png'), preview.toPNG());
      console.log(
        `Exported ${sizes.length} PNG sizes, a ${icoFrames.length}-frame Windows ICO, ${Object.keys(icons).length} SVG icons, and brand-preview.png.`,
      );
      win.destroy();
      clearTimeout(timeout);
      app.quit();
    })
    .catch((error) => {
      console.error(error);
      clearTimeout(timeout);
      app.exit(1);
    });
}
