import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { initDatabase } from "./src/server/db";
import { adminRouter } from "./src/server/routes/admin.routes";
import { analyticsRouter } from "./src/server/routes/analytics.routes";
import { authRouter } from "./src/server/routes/auth.routes";
import { hardwareRouter } from "./src/server/routes/hardware.routes";
import { maintenanceRouter } from "./src/server/routes/maintenance.routes";
import { notificationsRouter } from "./src/server/routes/notifications.routes";
import { stationsRouter } from "./src/server/routes/stations.routes";
import { tripsRouter } from "./src/server/routes/trips.routes";
import { usersRouter } from "./src/server/routes/users.routes";
import { walletRouter } from "./src/server/routes/wallet.routes";
import { IOE_METADATA } from "./src/server/services/analyticsService";
import { startScheduler } from "./src/server/services/schedulerService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  initDatabase();

  app.use(cors());
  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      system: IOE_METADATA.system,
      version: IOE_METADATA.version,
      pillars: ["PEOPLE", "PROCESS", "DATA", "THINGS"],
    });
  });

  app.use("/api", hardwareRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/stations", stationsRouter);
  app.use("/api/wallet", walletRouter);
  app.use("/api/trips", tripsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/maintenance", maintenanceRouter);

  // Start the IoE scheduled task runner (low-balance sweeps, anomaly
  // detection, and automatic maintenance ticket generation).
  startScheduler();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
