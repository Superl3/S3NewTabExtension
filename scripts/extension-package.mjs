import fs from "node:fs";
import path from "node:path";

export const extensionPackageFiles = [
  "app.js", "bookmarks.js", "manifest.json", "newtab.html",
  "single-item-surfaces.css", "storage.js", "styles.css", "widget-drag-motion.css"
];
export const extensionPackageDirectories = ["config", "content-scripts", "core", "fonts", "icons", "widgets"];

export function buildSmokeExtensionPackage(root, packageDir) {
  fs.mkdirSync(packageDir, { recursive: true });
  for (const relativePath of [...extensionPackageFiles, ...extensionPackageDirectories]) {
    const source = path.join(root, relativePath);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing extension package input: ${relativePath}`);
    }
    fs.cpSync(source, path.join(packageDir, relativePath), { recursive: true });
  }
}
