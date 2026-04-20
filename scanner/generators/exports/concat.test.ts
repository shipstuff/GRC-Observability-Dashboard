import { describe, expect, it } from "vitest";
import { concatCsv, splitHeaderAndBody } from "./concat.js";

describe("splitHeaderAndBody", () => {
  it("splits at the first unquoted newline", () => {
    const csv = "a,b,c\nr1c1,r1c2,r1c3\nr2c1,r2c2,r2c3\n";
    const { header, body } = splitHeaderAndBody(csv);
    expect(header).toBe("a,b,c");
    expect(body).toBe("r1c1,r1c2,r1c3\nr2c1,r2c2,r2c3\n");
  });

  it("ignores newlines inside quoted fields when finding the header boundary", () => {
    // Quoted cell on the header row's second column contains a newline.
    const csv = `"col\nwith\nnewlines",b\nr1c1,r1c2\n`;
    const { header, body } = splitHeaderAndBody(csv);
    expect(header).toBe(`"col\nwith\nnewlines",b`);
    expect(body).toBe("r1c1,r1c2\n");
  });

  it("handles CRLF line endings", () => {
    const csv = "a,b\r\nr1c1,r1c2\r\n";
    const { header, body } = splitHeaderAndBody(csv);
    expect(header).toBe("a,b");
    expect(body).toBe("r1c1,r1c2\r\n");
  });

  it("handles doubled-quote escape without flipping in-quotes state", () => {
    const csv = `a,b\n"field with ""embedded"" quotes",normal\n`;
    const { header, body } = splitHeaderAndBody(csv);
    expect(header).toBe("a,b");
    expect(body).toBe(`"field with ""embedded"" quotes",normal\n`);
  });
});

describe("concatCsv", () => {
  it("preserves quoted rows that contain embedded newlines (regression: PR #32 Codex P1)", () => {
    // Two per-repo CSVs whose bodies include quoted cells with real \n
    // inside. The pre-fix split("\n") implementation would turn each of
    // those quoted cells into multiple broken rows.
    const a = `repo,evidence\nalpha,"line one\nline two"\n`;
    const b = `repo,evidence\nbeta,"line three\nline four"\n`;
    const out = concatCsv([a, b]);
    expect(out).toBe(
      `repo,evidence\nalpha,"line one\nline two"\nbeta,"line three\nline four"\n`,
    );
  });

  it("keeps exactly one header regardless of input count", () => {
    const a = "h1,h2\nr1a,r1b\n";
    const b = "h1,h2\nr2a,r2b\n";
    const c = "h1,h2\nr3a,r3b\n";
    const out = concatCsv([a, b, c]);
    expect(out.split("\n").filter(l => l === "h1,h2").length).toBe(1);
  });

  it("returns an empty string for no inputs", () => {
    expect(concatCsv([])).toBe("");
  });

  it("drops inputs with no body (header-only CSVs) without leaving blank rows", () => {
    const empty = "repo,evidence\n";
    const data = `repo,evidence\nbeta,ok\n`;
    const out = concatCsv([empty, data]);
    expect(out).toBe("repo,evidence\nbeta,ok\n");
  });
});
