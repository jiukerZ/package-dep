import registryUrl from "registry-url";
import semver from "semver";
import { pick } from "lodash-es";
import { readFile } from "fs/promises";
import XLSX from "xlsx";
import async from "async";
import ora from "ora";

interface RunParams {
  outfile?: string;
}

interface Package {
  name: string;
  version: string;
  description: string;
  license: string;
  homepage: string;
  author?: { name: string; email: string };
}

interface PackageStore extends Package {
  versions: { [key in string]: Package };
}

type PackageResult =
  | {
      success: true;
      data: Package;
    }
  | {
      success: false;
      error: string;
    };

export async function run(p: RunParams) {
  const entryfile = "package.json";
  const outfile = p.outfile || "dependencies.xlsx";

  const pkg = JSON.parse(await readFile(entryfile, "utf-8")) as any;

  const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies) as {
    [key in string]: string;
  };
  const collect: Package[] = [];
  const packages = Object.keys(deps);
  const urls = [] as { [key in string]: string }[];

  for (let index = 0; index < packages.length; index++) {
    const name = packages[index];
    const sVersion = deps[name];
    if (name.startsWith("@types/")) continue;
    urls.push({
      name: name.toLowerCase(),
      version: sVersion,
    });
  }

  const spinner = ora({
    color: "blue",
    text: `Fetching component 0/${urls.length}...`,
  }).start();

  await new Promise((res) => {
    async.mapLimit(
      urls,
      5,
      async ({ name, version }: { [key in string]: string }) => {
        const res = await fetchData(
          registryUrl() + name.toLowerCase(),
          version
        );
        if (res.success === true) {
          collect.push(res.data);
          spinner.text = `Fetching component ${collect.length}/${urls.length}...`;
        }
      },
      () => {
        res(true);
      }
    );
  });

  spinner.succeed();
  writeExcel(collect, outfile);

  ora().succeed(`finished! ${outfile}`).stop();
}

async function fetchData(
  url: string,
  targetVersion: string
): Promise<PackageResult> {
  try {
    const response = await fetch(url);

    const dataParsed = (await response.json()) as PackageStore;

    const matchVersion = filterVersion(dataParsed.versions, targetVersion);

    return matchVersion
      ? {
          success: true,
          data: pick(matchVersion, [
            "name",
            "version",
            "homepage",
            "license",
            "description",
            "author",
          ]),
        }
      : {
          success: false,
          error: "Not found",
        };
  } catch (error) {
    return {
      success: false,
      error: "Error on retrieve package information",
    };
  }
}

function filterVersion(versions: { [key in string]: Package }, target: string) {
  let matched: Package | null = null;

  const vs = Object.values(versions);
  for (let index = 0; index < vs.length; index++) {
    const v = vs[index];
    const isValid = semver.satisfies(v.version, target);
    if (!isValid) continue;
    // 筛选出较大版本的
    matched = matched || v;
    if (semver.gte(v.version, matched.version)) {
      matched = v;
    }
  }

  return matched;
}

function writeExcel(pkg: Package[], file: string) {
  const data = pkg.map((i, index) => [
    index + 1,
    i.name,
    i.version,
    i.homepage,
    i.license,
    i.description,
  ]);
  data.unshift([
    "No.",
    "Package name",
    "Version",
    "URL",
    "License",
    "Description",
  ]);
  // 生成工作表
  const ws = XLSX.utils.aoa_to_sheet(data);
  // 生成工作簿并添加工作表
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, file);
}
