import { Router, type IRouter } from "express";
import healthRouter from "./health";
import imagesRouter from "./images";
import { createPaletteRouter } from "./palettes";
import { paletteStore } from "../lib/paletteStore";
import { createSettingsRouter } from "./settings";
import { settingsStore } from "../lib/settingsStore";
import { createAdminRouter } from "./admin";
import { adminStore } from "../lib/adminStore";

const router: IRouter = Router();
router.use(healthRouter);
router.use(imagesRouter);
router.use(createPaletteRouter(paletteStore));
router.use(createSettingsRouter(settingsStore));
router.use(createAdminRouter(adminStore));
export default router;
