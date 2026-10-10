import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiImagesRouter from "./openai/images";

const router: IRouter = Router();

router.use(healthRouter);
router.use(openaiImagesRouter);

export default router;
