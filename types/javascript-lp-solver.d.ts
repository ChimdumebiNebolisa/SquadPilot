declare module "javascript-lp-solver" {
  interface SolverModel {
    optimize: string;
    opType: "max" | "min";
    constraints: Record<string, Record<string, number>>;
    variables: Record<string, Record<string, number>>;
    ints?: Record<string, 1>;
    binaries?: Record<string, 1>;
  }

  interface SolverResult {
    feasible?: boolean;
    result?: number;
    bounded?: boolean;
    [variableName: string]: boolean | number | undefined;
  }

  const solver: {
    Solve(model: SolverModel): SolverResult;
  };

  export default solver;
}