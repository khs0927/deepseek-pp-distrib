// jev_call.mjs — reusable JEV bridge for GOD-CAD (offline batch)
// Usage: node jev_call.mjs <tool> <jsonArgsFile>
import { readFileSync } from "node:fs";
const [tool, argsFile] = process.argv.slice(2);
const raw = readFileSync(argsFile, "utf8").replace(/^\uFEFF/, "");
const args = JSON.parse(raw);
const m = await import("./mcp-gateway-provider.mjs");
const h = m.createMcpGatewayHandlers();
const call = h.find(x => x.name === "mcp_call");
const res = await call.handle({ server: "jev", tool, arguments: args });
const text = res?.structuredContent?.result?.content?.[0]?.text ?? JSON.stringify(res);
process.stdout.write(text);
