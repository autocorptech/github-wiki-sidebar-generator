import fs, { Stats } from "fs";
import path from "path";
const ignore = require("ignore-file") as any;

const tab = "  ";
const maxHeadingDepth = 6;
function formatLink(name: string, link?: string) {
  return !!link ? `[[${name}|${link}]]` : name;
}

function formatListItem(depth: number, name: string, link?: string): string {
  const indent = tab.repeat(depth);
  return `${indent}- ${formatLink(name, link)}\n`;
}

function formatHeading(
  depth: number,
  name: string,
  bufMod: number = 0
): string {
  if (!name) return "";
  const tail = bufMod < 0 ? "\n" : "\n\n";
  const buffer = bufMod > 0 ? "\n".repeat(bufMod) : "";
  return [
    buffer,
    '#'.repeat(Math.min(depth + 1, maxHeadingDepth)) + " ",
    name,
    tail
  ].join("");
}

function formatTitle(name: string) {
  return formatHeading(0, name, -1);
}

function getIndex(folder: string, names?: string | string[]): string | void {
  if (names == null) return;
  names = Array.isArray(names) ? names : [names];
  const chkName = folder.toLowerCase();
  return names.find(f => {
    const base = path.basename(f, '.md').toLowerCase();
    return base === chkName || base.startsWith("index-") || base.endsWith("-index")
  })
}

type Filter = (path: string) => boolean;

type Formatter<A = never> = {
  depth: number;
  page: (name: string) => string
  directory: (name: string, link?: string) => string
} & ([A] extends [never] ? Record<never, never> : A)

const sidebarFormatter: Formatter = {
  depth: 0,
  page(name: string): string {
    return formatListItem(this.depth, name, name);
  },
  directory(name: string, link?: string): string {
    return formatListItem(this.depth++, name, link);
  }
}

const homeFormatter: Formatter<{ level: number }> = {
  depth: 0,
  level: 0,
  page(name: string): string {
    return formatListItem(this.depth, name, name);
  },
  directory(name: string, link?: string): string {
    this.depth = 0;
    const ret = [];
    const printHeading = this.level < maxHeadingDepth;
    if (printHeading) {
      ret.push(formatHeading(++this.level, name, 1))
    }

    if (!!link || !printHeading) {
      ret.push(formatListItem(this.depth++, name, link))
    }

    return ret.filter(Boolean).join("");
  }
}

function addDirectoryItems(
  doc: string,
  rootPath: string,
  dirPath: string,
  filter: Filter,
  formatter: Formatter
): string {
  const files = fs
    .readdirSync(dirPath)
    .map(filename => {
      const absPath = path.join(dirPath, filename);
      return [
        filename,
        absPath,
        fs.lstatSync(absPath)
      ] as [string, string, Stats]
    })
    .sort(([aFile, , aStats], [bFile, , bStats]) => {
      // Sort directories first.
      if (aStats.isDirectory() !== bStats.isDirectory()) {
        return aStats.isDirectory() ? 1 : -1;
      }
      return aFile.localeCompare(bFile, undefined, { sensitivity: "base" })
    });

  let folderName = path.basename(dirPath);
  return files.reduce((acc, [filename, absPath, stats]) => {
    if (!(filename.startsWith(".") || filename.startsWith("_"))) {
      const relPath = path.relative(rootPath, absPath);
      if (relPath == "Home.md") return acc;


      if (!filter(relPath)) {
        if (stats.isDirectory()) {
          let folderName = path.basename(absPath);
          const dirFormatter = Object.create(formatter);
          const nextFiles = fs.readdirSync(absPath);
          const indexFile = getIndex(folderName, nextFiles) || "";
          acc += dirFormatter.directory(
            filename,
            path.basename(indexFile, ".md")
          );
          acc = addDirectoryItems(acc, rootPath, absPath, filter, dirFormatter);
        } else if (filename.endsWith(".md") && stats.isFile()) {
          if (!getIndex(folderName, filename)) {
            const ext = path.extname(filename);
            const name = path.basename(filename, ext);
            acc += formatter.page(name);
          }
        }
      }
    }
    return acc;
  }, doc);
}

export function generateSidebar(root: string, filter: Filter): string {
  return addDirectoryItems("", root, root, filter, sidebarFormatter);
}

export function generateHome(root: string, title: string, filter: Filter) {
  return addDirectoryItems(formatTitle(title), root, root, filter, homeFormatter);
}

export function writeSidebar(root: string, filter: Filter): void {
  const outPath = path.join(root, "_Sidebar.md");
  writeFile(outPath, generateSidebar(root, filter));
}

export function writeHome(root: string, title: string, filter: Filter): void {
  const outPath = path.join(root, "Home.md");
  writeFile(outPath, generateHome(root, title, filter));
}

function writeFile(path: string, content: string) {
  fs.writeFileSync(path, content);
  console.log(`Created ${path}`);
}

export function write(root: string, title: string) {
  const filter = ignore.sync(".wikiignore") || ignore.compile("");
  writeHome(root, title, filter);
  writeSidebar(root, filter);
}
