import { Readable } from "node:stream";
import type { ProjectBackupRow } from "@workspace/db/schema";
import {
  MAX_ACCOUNT_PROJECT_BACKUP_BYTES,
  MAX_CLOUD_PROJECT_BACKUPS,
  MAX_CLOUD_PROJECT_BACKUP_BYTES,
} from "./projectBackupStore";

const ZIP32_MAX = 0xffff_ffff;
const MAX_ARCHIVE_OVERHEAD_BYTES = 256 * 1024;
const ZIP_CHUNK_BYTES = 64 * 1024;
const ZIP_FLAG_UTF8 = 0x0800;
const ZIP_METHOD_STORE = 0;
const ZIP_DOS_DATE = 0x0021;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb8_8320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

type ZipEntry = {
  name: string;
  nameBytes: Buffer;
  content: Buffer;
  crc: number;
  offset: number;
};

export class ProjectBackupArchiveLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectBackupArchiveLimitError";
  }
}

function crc32(content: Buffer): number {
  let crc = 0xffff_ffff;
  for (const byte of content) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffff_ffff) >>> 0;
}

function safeTitleSlug(title: string): string {
  const slug = title.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .toLowerCase();
  return slug || "sketch";
}

function localHeader(entry: ZipEntry): Buffer {
  const header = Buffer.alloc(30 + entry.nameBytes.length);
  header.writeUInt32LE(0x0403_4b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(ZIP_FLAG_UTF8, 6);
  header.writeUInt16LE(ZIP_METHOD_STORE, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(ZIP_DOS_DATE, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.content.length, 18);
  header.writeUInt32LE(entry.content.length, 22);
  header.writeUInt16LE(entry.nameBytes.length, 26);
  header.writeUInt16LE(0, 28);
  entry.nameBytes.copy(header, 30);
  return header;
}

function centralHeader(entry: ZipEntry): Buffer {
  const header = Buffer.alloc(46 + entry.nameBytes.length);
  header.writeUInt32LE(0x0201_4b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(ZIP_FLAG_UTF8, 8);
  header.writeUInt16LE(ZIP_METHOD_STORE, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(ZIP_DOS_DATE, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.content.length, 20);
  header.writeUInt32LE(entry.content.length, 24);
  header.writeUInt16LE(entry.nameBytes.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset, 42);
  entry.nameBytes.copy(header, 46);
  return header;
}

function endOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x0605_4b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entryCount, 8);
  end.writeUInt16LE(entryCount, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return end;
}

export function createProjectBackupArchive(rows: ProjectBackupRow[]): {
  stream: Readable;
  contentLength: number;
} {
  if (rows.length > MAX_CLOUD_PROJECT_BACKUPS) {
    throw new ProjectBackupArchiveLimitError("Account backup count exceeds the export limit.");
  }

  let totalBytes = 0;
  const backupEntries: ZipEntry[] = [];
  const manifestBackups: Array<{
    id: string;
    title: string;
    createdAt: string;
    sizeBytes: number;
    file: string;
  }> = [];

  for (const row of rows) {
    const actualSize = Buffer.byteLength(row.backup, "utf8");
    if (actualSize < 1 || actualSize > MAX_CLOUD_PROJECT_BACKUP_BYTES || actualSize !== row.sizeBytes) {
      throw new Error("Stored project backup has invalid size metadata.");
    }
    totalBytes += actualSize;
    if (totalBytes > MAX_ACCOUNT_PROJECT_BACKUP_BYTES) {
      throw new ProjectBackupArchiveLimitError("Account backup data exceeds the export size limit.");
    }

    const file = `backups/${safeTitleSlug(row.title)}-${row.id}.json`;
    const content = Buffer.from(row.backup, "utf8");
    const nameBytes = Buffer.from(file, "utf8");
    backupEntries.push({
      name: file,
      nameBytes,
      content,
      crc: crc32(content),
      offset: 0,
    });
    manifestBackups.push({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      sizeBytes: actualSize,
      file,
    });
  }

  const manifest = Buffer.from(JSON.stringify({
    format: "cloudpainter-account-backups",
    version: 1,
    exportedAt: new Date().toISOString(),
    backups: manifestBackups,
  }, null, 2), "utf8");
  const entries: ZipEntry[] = [{
    name: "manifest.json",
    nameBytes: Buffer.from("manifest.json", "utf8"),
    content: manifest,
    crc: crc32(manifest),
    offset: 0,
  }, ...backupEntries];

  let localSize = 0;
  for (const entry of entries) {
    entry.offset = localSize;
    localSize += 30 + entry.nameBytes.length + entry.content.length;
    if (localSize > ZIP32_MAX) throw new ProjectBackupArchiveLimitError("Archive is too large.");
  }
  const central = entries.map(centralHeader);
  const centralOffset = localSize;
  const centralSize = central.reduce((sum, header) => sum + header.length, 0);
  const end = endOfCentralDirectory(entries.length, centralSize, centralOffset);
  const contentLength = localSize + centralSize + end.length;
  if (contentLength > MAX_ACCOUNT_PROJECT_BACKUP_BYTES + MAX_ARCHIVE_OVERHEAD_BYTES) {
    throw new ProjectBackupArchiveLimitError("Archive is too large.");
  }

  const stream = Readable.from((async function* () {
    for (const entry of entries) {
      yield localHeader(entry);
      for (let offset = 0; offset < entry.content.length; offset += ZIP_CHUNK_BYTES) {
        yield entry.content.subarray(offset, Math.min(offset + ZIP_CHUNK_BYTES, entry.content.length));
      }
    }
    yield* central;
    yield end;
  })());

  return { stream, contentLength };
}
