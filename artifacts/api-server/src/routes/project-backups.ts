import { json, Router, type ErrorRequestHandler, type RequestHandler } from "express";
import { pipeline } from "node:stream/promises";
import { getAuth } from "@clerk/express";
import {
  CreateProjectBackupBody,
  CreateProjectBackupResponse,
  DeleteProjectBackupParams,
  GetProjectBackupParams,
  GetProjectBackupResponse,
  ListProjectBackupsResponse,
} from "@workspace/api-zod";
import {
  MAX_ACCOUNT_PROJECT_BACKUP_BYTES,
  MAX_CLOUD_PROJECT_BACKUP_BYTES,
  MAX_CLOUD_PROJECT_BACKUPS,
  ProjectBackupStore,
} from "../lib/projectBackupStore";
import {
  createProjectBackupArchive,
  ProjectBackupArchiveLimitError,
} from "../lib/projectBackupArchive";

export const PROJECT_BACKUP_REQUEST_LIMIT_BYTES = MAX_CLOUD_PROJECT_BACKUP_BYTES + 128 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function backupTitle(contents: string): string | null {
  try {
    const parsed: unknown = JSON.parse(contents);
    if (!isRecord(parsed) || parsed.format !== "cloudpainter-project" || parsed.version !== 1
      || !isRecord(parsed.project) || typeof parsed.project.title !== "string") return null;
    const title = parsed.project.title.trim();
    return title && title.length <= 120 ? title : null;
  } catch {
    return null;
  }
}

function summary(row: { id: string; title: string; sizeBytes: number; createdAt: Date }) {
  return {
    id: row.id,
    title: row.title,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createProjectBackupRouter(store: ProjectBackupStore) {
  const router = Router();
  const auth: RequestHandler = (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    const { userId, sessionId } = getAuth(req);
    if (!userId || !sessionId || req.get("X-Project-Session") !== sessionId) {
      res.status(401).json({ error: "Sign in again to access your account backups." });
      return;
    }
    res.locals.projectBackupOwner = userId;
    next();
  };
  router.use("/project-backups", auth);

  router.get("/project-backups", async (req, res): Promise<void> => {
    try {
      const result = await store.list(res.locals.projectBackupOwner);
      res.json(ListProjectBackupsResponse.parse({
        backups: result.backups.map(summary),
        totalBytes: result.totalBytes,
        accountLimitBytes: MAX_ACCOUNT_PROJECT_BACKUP_BYTES,
      }));
    } catch (error) {
      req.log.error({ err: error }, "Could not list account project backups");
      res.status(503).json({ error: "Project backups could not load. Please retry." });
    }
  });

  router.get("/project-backups/export", async (req, res): Promise<void> => {
    try {
      const rows = await store.exportAll(res.locals.projectBackupOwner);
      const archive = createProjectBackupArchive(rows);
      res.status(200);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="cloudpainter-account-backups.zip"');
      res.setHeader("Content-Length", archive.contentLength);
      res.setHeader("X-Content-Type-Options", "nosniff");
      await pipeline(archive.stream, res);
    } catch (error) {
      if (res.headersSent || res.destroyed) {
        req.log.debug({ err: error }, "Account project backup export was interrupted");
        if (!res.destroyed) res.destroy(error instanceof Error ? error : undefined);
        return;
      }
      if (error instanceof ProjectBackupArchiveLimitError) {
        res.status(413).json({ error: "Your account backup archive exceeds the export limit." });
        return;
      }
      req.log.error({ err: error }, "Could not export account project backups");
      res.status(503).json({ error: "Account backups could not be exported. Please retry." });
    }
  });

  router.post(
    "/project-backups",
    json({ limit: PROJECT_BACKUP_REQUEST_LIMIT_BYTES, strict: true }),
    async (req, res): Promise<void> => {
      if (req.get("Sec-Fetch-Site") === "cross-site") {
        res.status(403).json({ error: "Cross-site backup requests are not allowed." });
        return;
      }
      if (isRecord(req.body) && typeof req.body.backup === "string"
        && Buffer.byteLength(req.body.backup, "utf8") > MAX_CLOUD_PROJECT_BACKUP_BYTES) {
        res.status(413).json({ error: "This project backup is larger than 2 MB." });
        return;
      }
      const parsed = CreateProjectBackupBody.strict().safeParse(req.body);
      if (!parsed.success
        || Object.keys(req.body ?? {}).some(key => !["requestId", "backup"].includes(key))) {
        res.status(400).json({ error: "Choose a valid CloudPainter project backup." });
        return;
      }
      const title = backupTitle(parsed.data.backup);
      if (!title) {
        res.status(400).json({ error: "This is not a supported CloudPainter project backup." });
        return;
      }
      try {
        const result = await store.create(
          res.locals.projectBackupOwner,
          parsed.data.requestId,
          title,
          parsed.data.backup,
        );
        if (result.kind === "account-quota") {
          res.status(409).json({
            error: `Account backups are limited to ${MAX_CLOUD_PROJECT_BACKUPS} projects and 32 MB. Delete an older backup to make room.`,
          });
          return;
        }
        if (result.kind === "global-quota") {
          res.status(409).json({
            error: "CloudPainter's shared backup storage is full right now. Your local sketch is unchanged; please retry later.",
          });
          return;
        }
        if (result.kind === "invalid-size") {
          res.status(413).json({ error: "This project backup is larger than 2 MB." });
          return;
        }
        if (result.kind === "request-mismatch") {
          res.status(409).json({ error: "This backup request was already used. Start the backup again." });
          return;
        }
        const output = CreateProjectBackupResponse.parse(summary(result.backup));
        res.status(result.kind === "created" ? 201 : 200).json(output);
      } catch (error) {
        req.log.error({ err: error }, "Could not save account project backup");
        res.status(503).json({ error: "Project backup could not be saved. Your local sketch is unchanged." });
      }
    },
  );

  router.get("/project-backups/:backupId", async (req, res): Promise<void> => {
    const params = GetProjectBackupParams.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ error: "Project backup not found." });
      return;
    }
    try {
      const row = await store.get(res.locals.projectBackupOwner, params.data.backupId);
      if (!row) {
        res.status(404).json({ error: "Project backup not found." });
        return;
      }
      res.json(GetProjectBackupResponse.parse({ ...summary(row), backup: row.backup }));
    } catch (error) {
      req.log.error({ err: error }, "Could not load account project backup");
      res.status(503).json({ error: "Project backup could not load. Your local sketch is unchanged." });
    }
  });

  router.delete("/project-backups/:backupId", async (req, res): Promise<void> => {
    if (req.get("Sec-Fetch-Site") === "cross-site") {
      res.status(403).json({ error: "Cross-site backup requests are not allowed." });
      return;
    }
    const params = DeleteProjectBackupParams.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ error: "Project backup not found." });
      return;
    }
    try {
      const deleted = await store.delete(res.locals.projectBackupOwner, params.data.backupId);
      if (!deleted) {
        res.status(404).json({ error: "Project backup not found." });
        return;
      }
      res.sendStatus(204);
    } catch (error) {
      req.log.error({ err: error }, "Could not delete account project backup");
      res.status(503).json({ error: "Project backup could not be deleted. Please retry." });
    }
  });

  const parserErrors: ErrorRequestHandler = (error, _req, res, next) => {
    const parserError = error as { status?: number; type?: string };
    if (parserError.type === "entity.too.large" || parserError.status === 413) {
      res.status(413).json({ error: "This project backup request exceeds the 2 MiB sketch limit." });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ error: "Choose a readable CloudPainter project backup." });
      return;
    }
    next(error);
  };
  router.use(parserErrors);
  return router;
}
