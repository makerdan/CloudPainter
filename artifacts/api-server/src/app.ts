import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import logoImagesRouter from "./routes/logo-images";
import imageUpscaleRouter from "./routes/image-upscale";
import outlineRouter from "./routes/outline";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(
    getClerkProxyHost(req) ?? "",
    process.env.CLERK_PUBLISHABLE_KEY,
  ),
})));
// This paid text-only endpoint owns its bounded parser and does not opt into CORS.
app.use("/api", logoImagesRouter);
// The upscaler owns a larger, explicit JSON limit; mount before the default parser.
app.use("/api", imageUpscaleRouter);
// Photo inference has its own session/origin gates and bounded ephemeral parser.
app.use("/api", outlineRouter);
// Other API routes retain their existing parser and account middleware.
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
export default app;
