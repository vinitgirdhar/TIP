import { Router } from "express";
import { authenticateToken, requireAdmin } from "../middleware/auth";
import {
  getAnomalyReport,
  getCongestionForecast,
  getIoeSystemOverview,
  getRevenueAnalytics,
} from "../services/analyticsService";
import { runScheduledTasksOnce } from "../services/schedulerService";

export const analyticsRouter = Router();

analyticsRouter.use(authenticateToken, requireAdmin);

analyticsRouter.get("/overview", (_req, res) => {
  res.json(getIoeSystemOverview());
});

analyticsRouter.get("/revenue", (_req, res) => {
  res.json(getRevenueAnalytics());
});

analyticsRouter.get("/congestion", (_req, res) => {
  res.json(getCongestionForecast());
});

analyticsRouter.get("/anomalies", (_req, res) => {
  res.json(getAnomalyReport());
});

// Manually trigger the scheduled task sweep (low balances, anomalies, silent
// devices) instead of waiting for the next automatic interval.
analyticsRouter.post("/tasks/run", (_req, res) => {
  res.json(runScheduledTasksOnce());
});
