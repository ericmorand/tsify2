import {Error as CompileError} from "./Error";
import {Host} from "./Host";
import {normalize as normalizePath, relative as relativePath} from "path";
import {EventEmitter} from "events";
import {EmitResult, JsxEmit, ModuleKind} from "typescript";
import {Transform, PassThrough} from "stream";
import {fromComment, commentRegex} from "convert-source-map";
import {Options as BrowserifyOptions} from "browserify";

import type {CompilerOptions, Program, Diagnostic, DiagnosticWithLocation} from "typescript";
import type {TransformCallback} from "stream";

export class Tsifier extends EventEmitter {
    private _ignoredFiles: Array<string>;
    private readonly _host: Host;
    private readonly _files: Array<string>;
    private readonly _options: CompilerOptions;
    private readonly _browserifyOptions: BrowserifyOptions;

    constructor(options: CompilerOptions, browserifyOptions?: BrowserifyOptions) {
        super();

        this._ignoredFiles = [];
        this._browserifyOptions = browserifyOptions;
        this._files = [];

        options.sourceMap = false;
        options.inlineSourceMap = browserifyOptions && browserifyOptions.debug;
        options.inlineSources = browserifyOptions && browserifyOptions.debug;
        options.module = options.module || ModuleKind.CommonJS;

        this._options = options;
        this._host = new Host(options);

        this._host.on('file', (file: string, id: string) => {
            this.emit('file', file, id);
        });
    }

    reset() {
        this._ignoredFiles = [];
        this._host.reset();
        this.addFiles(this._files);
    }

    addFiles(files: Array<string>) {
        for (let file of files) {
            this._host.addFile(file, true);
        }
    }

    replaceFileExtension(file: string, extension: string): string {
        return file.replace(/\.\w+$/i, extension);
    };

    isTypescriptDeclaration(file: string): boolean {
        return (/\.d\.ts$/i).test(file);
    };

    isTypescript(file: string): boolean {
        return (/\.tsx?$/i).test(file);
    };

    isTsx(file: string): boolean {
        return (/\.tsx$/i).test(file);
    };

    isJavascript(file: string): boolean {
        return (/\.jsx?$/i).test(file);
    };

    generateCache(files: Array<string>, ignoredFiles?: Array<string>): void {
        if (ignoredFiles) {
            this._ignoredFiles = ignoredFiles;
        }

        this.addFiles(files);
        this.compile();
    };

    compile() {
        const program = this._host.compile(this._options);
        const syntaxDiagnostics = this.checkSyntax(program);

        if (syntaxDiagnostics.length) {
            return;
        }

        const semanticDiagnostics = this.checkSemantics(program);

        if (semanticDiagnostics.length && this._options.noEmitOnError) {
            return;
        }

        const emitOutput = program.emit();

        const emittedDiagnostics = this.checkEmittedOutput(emitOutput);

        if (emittedDiagnostics.length && this._options.noEmitOnError) {
            return;
        }
    };

    checkSyntax(program: Program): readonly DiagnosticWithLocation[] {
        const syntaxDiagnostics = program.getSyntacticDiagnostics();

        for (let diagnostic of syntaxDiagnostics) {
            this.emit('error', new CompileError(diagnostic));
        }

        if (syntaxDiagnostics.length) {
            this._host.hasError = true;
        }

        return syntaxDiagnostics;
    };

    checkSemantics(program: Program): readonly Diagnostic[] {
        let semanticDiagnostics = program.getGlobalDiagnostics();

        if (semanticDiagnostics.length === 0) {
            semanticDiagnostics = program.getSemanticDiagnostics();
        }

        for (let diagnostic of semanticDiagnostics) {
            this.emit('error', new CompileError(diagnostic));
        }

        if (semanticDiagnostics.length && this._options.noEmitOnError) {
            this._host.hasError = true;
        }

        return semanticDiagnostics;
    };

    checkEmittedOutput(emitResult: EmitResult): readonly Diagnostic[] {
        const emittedDiagnostics = emitResult.diagnostics;

        for (let diagnostic of emittedDiagnostics) {
            this.emit('error', new CompileError(diagnostic));
        }

        if (emittedDiagnostics.length && this._options.noEmitOnError) {
            this._host.hasError = true;
        }

        return emittedDiagnostics;
    };

    transform(file: string) {
        const host = this._host;

        const getCompiledFile = (file: string): Buffer => {
            return this.getCompiledFile(file);
        }

        if (this._ignoredFiles.indexOf(file) !== -1) {
            return new PassThrough();
        }

        if (this.isTypescriptDeclaration(file)) {
            return new Transform({
                transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
                    callback();
                }
            });
        }

        if (this.isTypescript(file) || (this.isJavascript(file) && this._options.allowJs)) {
            return new Transform({
                transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
                    callback();
                },
                flush(callback: TransformCallback) {
                    if (host.hasError) {
                        callback();
                        return;
                    }

                    const compiled = getCompiledFile(file);

                    if (compiled) {
                        this.push(compiled);
                    }

                    this.push(null);

                    callback();
                }
            })
        }

        return new PassThrough();
    };

    getCompiledFile(inputFile: string, alreadyMissedCache: boolean = false): Buffer {
        const outputExtension = (this._options.jsx === JsxEmit.Preserve && this.isTsx(inputFile)) ? '.jsx' : '.js';

        let output = this._host.output(this.replaceFileExtension(inputFile, outputExtension));

        if (output === undefined) {
            if (alreadyMissedCache) {
                this.emit('error', new Error('tsify: no compiled file for ' + inputFile));
                return;
            }

            this.generateCache([inputFile]);

            if (this._host.hasError) {
                return;
            }

            return this.getCompiledFile(inputFile, true);
        }

        if (this._options.inlineSourceMap) {
            output = this.setSourcePathInSourcemap(output, inputFile);
        }

        return output;
    };

    setSourcePathInSourcemap(output: Buffer, inputFile: string): Buffer {
        const outputAsString: string = output.toString();

        const normalized = normalizePath(relativePath(
            this._browserifyOptions.basedir || process.cwd(),
            inputFile
        ));

        const sourcemap = fromComment(outputAsString);

        sourcemap.setProperty('sources', [normalized]);

        return Buffer.from(outputAsString.replace(commentRegex, sourcemap.toComment()));
    }
}
