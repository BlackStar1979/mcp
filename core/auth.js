import { ACCESS_SECRET } from "./config.js";

export function requireAuth(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }

  if (!ACCESS_SECRET) {
    res.status(500).send("Missing secret");
    return;
  }

  const urlSecret = req.query.token;
  const header = req.headers["authorization"] || "";
  const parts = header.split(/\s+/);
  const supplied =
    parts.length === 2 && parts[0].toLowerCase() === "bearer"
      ? parts[1]
      : null;

  if (urlSecret === ACCESS_SECRET || supplied === ACCESS_SECRET) {
    return next();
  }

  res.status(401).send("Unauthorized");
}