/// <reference types="vite/client" />

declare module '@piper-phonemize-internal' {
  export interface PiperPhonemizeModuleOptions {
    wasmBinary?: ArrayBuffer;
    getPreloadedPackage?: (remotePackageName: string, remotePackageSize: number) => ArrayBuffer;
    print?: (stdoutLine: string) => void;
    printErr?: (stderrLine: string) => void;
    locateFile?: (path: string, scriptDirectory?: string) => string;
  }

  export interface PiperPhonemizeEmscriptenInstance {
    callMain: (args: string[]) => number;
  }

  export function createPiperPhonemize(
    options?: PiperPhonemizeModuleOptions
  ): Promise<PiperPhonemizeEmscriptenInstance>;
}
