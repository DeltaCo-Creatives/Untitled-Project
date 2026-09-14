import express from "express";
import dotenv from "dotenv";
import driveWebhookRouter from "./src/routes/driveWebhook.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/webhook/drive", driveWebhookRouter);

app.listen(PORT, () => {
  console.log(`DriveTag AI backend listening on port ${PORT}`);
});
