import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vantageArsRouter from "./vantage-ars";

const router: IRouter = Router();

router.use(healthRouter);
router.use(vantageArsRouter);

export default router;
