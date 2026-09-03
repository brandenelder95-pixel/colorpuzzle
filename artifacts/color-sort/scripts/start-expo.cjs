const { spawn } = require("node:child_process");

const env = { ...process.env };
const args = ["exec", "expo", "start"];

if (env.REPLIT_EXPO_DEV_DOMAIN) {
  env.EXPO_PACKAGER_PROXY_URL = `https://${env.REPLIT_EXPO_DEV_DOMAIN}`;
}

if (env.REPLIT_DEV_DOMAIN) {
  env.EXPO_PUBLIC_DOMAIN = env.REPLIT_DEV_DOMAIN;
}

if (env.REPL_ID) {
  env.EXPO_PUBLIC_REPL_ID = env.REPL_ID;
}

if (env.REPLIT_DEV_DOMAIN) {
  env.REACT_NATIVE_PACKAGER_HOSTNAME = env.REPLIT_DEV_DOMAIN;
  args.push("--localhost");
}

if (env.PORT) {
  args.push("--port", env.PORT);
}

const child = spawn("pnpm", args, {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});

child.on("error", (error) => {
  console.error(`Unable to start Expo: ${error.message}`);
  process.exit(1);
});