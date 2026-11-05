import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomePage } from "./HomePage";

describe("HomePage", () => {
  it("mostra o banco no ar", () => {
    render(<HomePage databaseUp />);

    expect(screen.getByRole("heading", { name: "tempmail" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Banco de dados: no ar");
  });

  it("mostra o banco fora do ar", () => {
    render(<HomePage databaseUp={false} />);

    expect(screen.getByRole("status")).toHaveTextContent("Banco de dados: fora do ar");
  });
});
