import path from 'node:path';

export function resolveHelperPath(
  packaged: boolean,
  appPath: string,
  resourcesPath: string,
): string {
  return packaged
    ? path.join(resourcesPath, 'leu-engine.exe')
    : path.join(appPath, 'target', 'x86_64-pc-windows-msvc', 'release', 'leu-engine.exe');
}

export function resolveAsset(root: string, pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.includes(':')) return undefined;
  const asset = path.resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
  const relative = path.relative(root, asset);
  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !/\.(html|js|css|map|png|svg|ico)$/.test(asset)
  )
    return undefined;
  return asset;
}
