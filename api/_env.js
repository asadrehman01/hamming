import fs from "node:fs";
import path from "node:path";

let cachedEnv = null;

const parseEnvFile = (filePath) => {
  const out = {};

  if (!fs.existsSync(filePath)) {
    return out;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
};

const loadLocalEnvFallback = () => {
  if (cachedEnv) {
    return cachedEnv;
  }

  const root = process.cwd();
  const envFromDotEnv = parseEnvFile(path.join(root, ".env"));
  const envFromDotEnvLocal = parseEnvFile(path.join(root, ".env.local"));

  cachedEnv = {
    ...envFromDotEnv,
    ...envFromDotEnvLocal,
  };

  return cachedEnv;
};

export const getEnv = (...keys) => {
  for (const key of keys) {
    const direct = process.env[key];
    if (typeof direct === "string" && direct.trim() !== "") {
      return direct.trim();
    }
  }

  const localFallback = loadLocalEnvFallback();
  for (const key of keys) {
    const value = localFallback[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
};
