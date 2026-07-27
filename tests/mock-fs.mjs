class MockFileHandle {
  constructor(name) {
    this.name = name;
    this.size = 0;
    this.textContent = "";
  }

  async getFile() {
    const size = this.size;
    const textContent = this.textContent;
    return {
      size,
      async text() {
        return textContent;
      }
    };
  }

  async createWritable() {
    const handle = this;
    let pendingSize = 0;
    let pendingText = "";
    let isText = false;

    return {
      async write(data) {
        if (typeof data === "string") {
          isText = true;
          pendingText = data;
          pendingSize = new TextEncoder().encode(data).length;
        } else if (data instanceof Uint8Array) {
          isText = true;
          pendingText = new TextDecoder().decode(data);
          pendingSize = data.length;
        } else if (data && typeof data.size === "number") {
          isText = false;
          pendingSize = data.size;
        } else {
          throw new Error("Tuntematon datatyyppi mock-kirjoituksessa.");
        }
      },
      async close() {
        handle.size = pendingSize;
        handle.textContent = isText ? pendingText : "";
      },
      async abort() {}
    };
  }
}

class MockDirectoryHandle {
  constructor(name) {
    this.name = name;
    this.children = new Map();
  }

  async getDirectoryHandle(name, options = {}) {
    if (this.children.has(name)) {
      const existing = this.children.get(name);
      if (!(existing instanceof MockDirectoryHandle)) {
        throw new Error(`${name} on jo tiedosto.`);
      }
      return existing;
    }

    if (options.create) {
      const dir = new MockDirectoryHandle(name);
      this.children.set(name, dir);
      return dir;
    }

    const error = new Error("Kansiota ei löytynyt.");
    error.name = "NotFoundError";
    throw error;
  }

  async getFileHandle(name, options = {}) {
    if (this.children.has(name)) {
      const existing = this.children.get(name);
      if (!(existing instanceof MockFileHandle)) {
        throw new Error(`${name} on jo kansio.`);
      }
      return existing;
    }

    if (options.create) {
      const file = new MockFileHandle(name);
      this.children.set(name, file);
      return file;
    }

    const error = new Error("Tiedostoa ei löytynyt.");
    error.name = "NotFoundError";
    throw error;
  }

  async removeEntry(name) {
    this.children.delete(name);
  }

  async *entries() {
    for (const entry of this.children.entries()) {
      yield entry;
    }
  }

  async queryPermission() {
    return "granted";
  }

  async requestPermission() {
    return "granted";
  }
}

export function createMockRoot() {
  return new MockDirectoryHandle("root");
}

export function fakeFile(name, size, type = "") {
  return { name, size, type };
}
