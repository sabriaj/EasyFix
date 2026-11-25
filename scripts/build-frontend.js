import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

const pages = [
  "account.html",
  "admin.html",
  "auth.html",
  "buy-credits.html",
  "contact.html",
  "delete-confirm.html",
  "delete.html",
  "forgot-password.html",
  "index.html",
  "login.html",
  "manage.html",
  "pay.html",
  "privacy.html",
  "pro-dashboard.html",
  "pro-login.html",
  "profile.html",
  "register.html",
  "reset-code.html",
  "reset-password.html",
  "success.html",
  "verify-email.html"
];

const scripts = ["admin.js", "auth-client.js", "code.js", "easyfix-config.js", "i18n.js"];
const stylesheets = ["styles.css"];
const icons = [
  "apple-touch-icon.png",
  "favicon-16.png",
  "favicon-32.png",
  "favicon.ico"
];

async function copyFiles(files, destination) {
  await mkdir(destination, { recursive: true });
  for (const file of files) {
    const source = path.join(root, file);
    await copyFile(source, path.join(destination, path.basename(file)));
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await copyFiles(pages, output);
await copyFiles(scripts, output);
await copyFiles(stylesheets, output);
await copyFiles(icons.map((file) => path.join("easyfix-icons-pack", file)), path.join(output, "easyfix-icons-pack"));

const outputEntries = await readdir(output, { withFileTypes: true });
console.log(`Built frontend output at dist/ (${outputEntries.length} root entries).`);
