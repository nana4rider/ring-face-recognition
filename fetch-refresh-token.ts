import env from "@/env";
import { writeFile } from "fs/promises";
import { acquireRefreshToken } from "node_modules/ring-client-api/lib/refresh-token";

const refreshToken = await acquireRefreshToken();

await writeFile(env.REFRESH_TOKEN_PATH, refreshToken);
