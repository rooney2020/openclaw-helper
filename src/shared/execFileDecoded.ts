import { execFile, type ExecFileOptions } from "child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
}

export function execFileDecoded(
  file: string,
  args: string[],
  options?: ExecFileOptions & { timeout?: number }
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(file, args, options, (err, stdout, stderr) => {
      const result: ExecResult = {
        stdout: (stdout ?? "").toString(),
        stderr: (stderr ?? "").toString(),
        code: 0,
        signal: null,
      };
      if (err) {
        result.code = ((err as NodeJS.ErrnoException & { code?: number }).code as number | undefined) ?? 1;
        result.signal = (err as { signal?: string | null }).signal ?? null;
        // Treat ENOENT and nonzero as error result, not rejection
        resolve(result);
      } else {
        resolve(result);
      }
    });
    if (options?.timeout && options.timeout > 0) {
      setTimeout(() => {
        child.kill();
        resolve({ stdout: "", stderr: "TIMEOUT", code: -1, signal: "SIGTERM" });
      }, options.timeout);
    }
  });
}
