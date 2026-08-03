const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const vendorDirectory = path.join(root, "public", "vendor");
const assets = [
  ["node_modules/htmx.org/dist/htmx.min.js", "htmx.min.js"],
  ["node_modules/vanilla-tilt/dist/vanilla-tilt.min.js", "vanilla-tilt.min.js"],
];

fs.mkdirSync(vendorDirectory, { recursive: true });
for (const [source, target] of assets) {
  fs.copyFileSync(path.join(root, source), path.join(vendorDirectory, target));
}

console.log(`Copied ${assets.length} vendor assets to public/vendor.`);
