import {EventEmitter} from "events";
import {
    createIncrementalProgram,
    createIncrementalCompilerHost
} from "typescript";

import type {
    SourceFile,
    ScriptTarget,
    CompilerOptions,
    EmitAndSemanticDiagnosticsBuilderProgram,
    CompilerHost
} from "typescript";

/**
 * @internal
 */
type HostFile = {
    filename: string,
    contents: string,
    tsSourceFile: SourceFile,
    root: boolean,
    nodeModule: boolean
};

export class Host extends EventEmitter {
    private readonly _languageVersion: ScriptTarget;
    private readonly _currentDirectory: string;
    private readonly _files: Array<string>;
    private _output: { [key: string]: string };
    private _hasError: boolean;
    private readonly _host: CompilerHost;
    private readonly _nativeGetSourceFile: (fileName: string, languageVersion: ScriptTarget, onError?: (message: string) => void, shouldCreateNewSourceFile?: boolean) => SourceFile;

    constructor(options: CompilerOptions) {
        super();

        this._currentDirectory = process.cwd();
        this._languageVersion = options.target;
        this._files = [];
        this._output = {};
        this._hasError = false;

        // compiler host
        this._host = createIncrementalCompilerHost(options);
        this._nativeGetSourceFile = this._host.getSourceFile;

        this._host.writeFile = (fileName, data) => {
            this._output[fileName] = data;
        };

        this._host.getSourceFile = (filename: string, languageVersion): SourceFile => {
            this.emit('file', filename);

            return this._nativeGetSourceFile(filename, languageVersion);
        };
    }

    set hasError(flag: boolean) {
        this._hasError = flag;
    }

    get hasError(): boolean {
        return this._hasError;
    }

    addFile(filename: string): void {
        this._files.push(filename);
    }

    createProgram(options: CompilerOptions): EmitAndSemanticDiagnosticsBuilderProgram {
        const host = this._host;
        const rootNames = this._files;

        const program: EmitAndSemanticDiagnosticsBuilderProgram = createIncrementalProgram({
            rootNames,
            options,
            host
        });

        return program;
    }

    output(filename: string): string {
        return this._output[filename];
    }
}
