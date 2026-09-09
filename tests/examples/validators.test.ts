import { describe, it, expect } from "vitest";
import { isValidEmail } from "./validators"; // 同じ階層からのインポート

describe("isValidEmail", () => {
  it("正しいメールアドレス形式の場合は true を返すこと", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("不正なメールアドレス形式の場合は false を返すこと", () => {
    expect(isValidEmail("invalid-email")).toBe(false);
  });
});

