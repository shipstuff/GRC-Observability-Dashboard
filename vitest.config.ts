import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Match *.test.ts anywhere in scanner/ and dashboard/. Scripts/ runs as
    // a runtime smoke test via tsx, not under the Vitest runner.
    include: ["scanner/**/*.test.ts", "dashboard/**/*.test.ts"],
    // Node environment is fine — none of the tested modules need the DOM or
    // Workers-specific globals. Auth tests that need crypto.subtle can use
    // the Node 20+ Web Crypto polyfill which is the default.
    environment: "node",
  },
});
