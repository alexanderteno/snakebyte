import fs from "node:fs";

declare global {
  // CodinGame starter bots expect a global readline function.
  var readline: () => string;
}

const fd = 0;
const buffer = Buffer.alloc(1);
let pending = "";

globalThis.readline = (): string => {
  while (true) {
    const newlineIndex = pending.indexOf("\n");
    if (newlineIndex !== -1) {
      const line = pending.slice(0, newlineIndex).replace(/\r$/, "");
      pending = pending.slice(newlineIndex + 1);
      return line;
    }

    const bytesRead = fs.readSync(fd, buffer, 0, 1, null);
    if (bytesRead === 0) {
      if (pending.length > 0) {
        const line = pending.replace(/\r$/, "");
        pending = "";
        return line;
      }
      throw new Error("stdin closed");
    }

    pending += buffer.toString("utf8", 0, bytesRead);
  }
};

await import("./starter.ts");

