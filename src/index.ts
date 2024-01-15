import { cac } from "cac";
import { run } from "./utils";

const cli = cac("pkg-deps");

cli
  .command("[root]", "start parser")
  .option("--out <name>", "[string] name of the output file")
  .action(
    async (
      root: string | undefined,
      options: { "--": string[]; out?: string }
    ) => {
      run({ outfile: options.out });
    }
  );

cli.help();

cli.parse();
