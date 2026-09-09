import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "./button";

describe("Button Component", () => {
  it("指定したテキストが描画されること", () => {
    render(<Button>送信</Button>);
    expect(screen.getByRole("button", { name: "送信" })).toBeInTheDocument();
  });

  it("disabled 属性が渡された場合、非活性化されること", () => {
    render(<Button disabled>送信</Button>);
    expect(screen.getByRole("button", { name: "送信" })).toBeDisabled();
  });
});

