import {EventEmitter} from "events";
import {readFileSync, lstatSync, realpathSync} from "fs";
import {basename as pathBasename, resolve, dirname, relative as relativePath, normalize} from "path";
import {
    createIncrementalProgram,
    createIncrementalCompilerHost
} from "typescript";

import type {
    SourceFile,
    ScriptTarget,
    CompilerOptions,
    Program,
    EmitAndSemanticDiagnosticsBuilderProgram,
    CompilerHost
} from "typescript";

/**
 * @internal
 */
type HostFile = {
    filename: string,
    contents: string,
    ts: SourceFile,
    root: boolean,
    nodeModule: boolean
};

export class Host extends EventEmitter {
    private readonly _outputDirectory: string;
    private readonly _rootDirectory: string;
    private readonly _languageVersion: ScriptTarget;
    private readonly _currentDirectory: string;
    private _files: { [key: string]: HostFile };
    private _previousFiles: { [key: string]: HostFile };
    private _output: { [key: string]: Buffer };
    private _hasError: boolean;
    private _libDefault: SourceFile;
    private readonly _host: CompilerHost;
    private readonly _getSourceFile: (fileName: string, languageVersion: ScriptTarget, onError?: (message: string) => void, shouldCreateNewSourceFile?: boolean) => SourceFile;

    constructor(options: CompilerOptions) {
        super();

        this._currentDirectory = process.cwd();
        this._outputDirectory = this.getCanonicalFileName(resolve(this._currentDirectory));
        this._rootDirectory = this.getCanonicalFileName(resolve(this._currentDirectory));
        this._languageVersion = options.target;
        this._files = {};
        this._previousFiles = {};
        this._output = {};
        this._hasError = false;

        // host
        this._host = createIncrementalCompilerHost(options);
        this._getSourceFile = this._host.getSourceFile;

        this._host.writeFile = (fileName, data) => {
            let outputCanonical = this.canonical(fileName);

            this._output[outputCanonical] = Buffer.from(data);

            const sourceCanonical = this.inferSourceCanonical(outputCanonical);
            const sourceFollowed = this.follow(dirname(sourceCanonical)) + '/' + pathBasename(sourceCanonical);

            if (sourceFollowed !== sourceCanonical) {
                outputCanonical = this.inferOutputCanonical(sourceFollowed);

                this._output[outputCanonical] = Buffer.from(data);
            }
        };

        this._host.getSourceFile = (filename: string): SourceFile => {
            if (filename === '__lib.d.ts') {
                return this._libDefault;
            }

            const canonical = this.canonical(filename);

            if (this._files[canonical]) {
                return this._files[canonical].ts;
            }

            return this.addFile(filename, false);
        };

        this._host.realpath = (name: string): string => {
            return realpathSync(name);
        };
    }

    set hasError(flag: boolean) {
        this._hasError = flag;
    }

    get hasError(): boolean {
        return this._hasError;
    }

    getCanonicalFileName(filename: string): string {
        return normalize(filename);
    }

    reset() {
        this._previousFiles = this._files;
        this._files = {};
        this._output = {};
        this._hasError = false;
    };

    addFile(filename: string, root: boolean): SourceFile {
        // Ensure that the relative file name is what's passed to 'createSourceFile', as that's the name that will be used in error messages, etc.
        const relative: string = normalize(
            relativePath(
                this._currentDirectory,
                this.getCanonicalFileName(resolve(this._currentDirectory, filename))
            )
        );

        const canonical = this.canonical(filename);

        let text: string;

        try {
            text = readFileSync(filename, 'utf-8');
        } catch (error) {
            return;
        }

        let file: SourceFile;

        const current = this._files[canonical];
        const previous = this._previousFiles[canonical];

        if (current && current.contents === text) {
            file = current.ts;
        } else if (previous && previous.contents === text) {
            file = previous.ts;
        } else {
            file = this._getSourceFile(relative, this._languageVersion);
        }

        this._files[canonical] = {
            filename: relative,
            contents: text,
            ts: file,
            root: root,
            nodeModule: /\/node_modules\//i.test(canonical) && !/\.d\.ts$/i.test(canonical)
        };

        this.emit('file', canonical, relative);

        return file;
    };

    canonical(filename: string): string {
        return this.getCanonicalFileName(resolve(
            this._currentDirectory,
            filename
        ));
    }

    inferOutputCanonical(filename: string): string {
        const sourceCanonical = this.canonical(filename);
        const outputRelative = relativePath(
            this._rootDirectory,
            sourceCanonical
        );
        const outputCanonical = this.getCanonicalFileName(resolve(
            this._outputDirectory,
            outputRelative
        ));

        return outputCanonical;
    }

    inferSourceCanonical(filename: string): string {
        const outputCanonical = this.canonical(filename);
        const outputRelative = relativePath(
            this._outputDirectory,
            outputCanonical
        );
        const sourceCanonical = this.getCanonicalFileName(resolve(
            this._rootDirectory,
            outputRelative
        ));

        return sourceCanonical;
    }

    follow(filename: string): string {
        filename = this.canonical(filename);

        let basename: string;

        const parts: Array<string> = [];

        do {
            const stats = lstatSync(filename);

            if (stats.isSymbolicLink()) {
                filename = realpathSync(filename);
            } else {
                basename = pathBasename(filename);

                if (basename) {
                    parts.unshift(basename);
                    filename = dirname(filename);
                }
            }
        } while (basename);

        return normalize(filename + parts.join('/'));
    };

    get rootFilenames(): Array<string> {
        const rootFilenames: Array<string> = [];

        for (let filename in this._files) {
            if (!this._files.hasOwnProperty(filename)) {
                continue;
            }

            if (!this._files[filename].root) {
                continue;
            }

            rootFilenames.push(filename);
        }

        return rootFilenames;
    }

    get nodeModuleFilenames(): Array<string> {
        const nodeModuleFilenames: Array<string> = [];

        for (let filename in this._files) {
            if (!this._files.hasOwnProperty(filename)) {
                continue;
            }

            if (!this._files[filename].nodeModule) {
                continue;
            }

            nodeModuleFilenames.push(filename);
        }

        return nodeModuleFilenames;
    }

    compile(options: CompilerOptions): Program {
        const rootNames = this.rootFilenames.concat(this.nodeModuleFilenames);
        const host = this._host;

        const builderProgram: EmitAndSemanticDiagnosticsBuilderProgram = createIncrementalProgram({
            rootNames,
            options,
            host
        });

        return builderProgram.getProgram();
    }

    output(filename: string): Buffer {
        const outputCanonical = this.inferOutputCanonical(filename);

        return this._output[outputCanonical];
    }
}
