import {Error as CompileError} from "./Error";
import {Host} from "./Host";
import {normalize as normalizePath, relative as relativePath} from "path";
import {EventEmitter} from "events";
import {EmitAndSemanticDiagnosticsBuilderProgram, EmitResult, JsxEmit} from "typescript";
import {Transform, PassThrough} from "stream";
import {fromComment, commentRegex} from "convert-source-map";

import type {CompilerOptions, Program, Diagnostic, DiagnosticWithLocation} from "typescript";
import type {TransformCallback} from "stream";
import type {Options as BrowserifyOptions, CustomOptions} from "browserify";

export type TransformOptions = CustomOptions & {
    global: boolean
};

export class Tsifier extends EventEmitter {
    private readonly _host: Host;
    private readonly _options: CompilerOptions;

    constructor(options: CompilerOptions) {
        super();

        this._options = options;
        this._host = new Host(options);

        this._host.on('file', (file: string, id: string) => {
            this.emit('file', file, id);
        });
    }

    addFiles(files: Array<string>) {
        for (let file of files) {
            this._host.addFile(file);
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

    compile() {
        console.time('create p');
        const program = this._host.createProgram(this._options);
        console.timeEnd('create p')
        // const syntaxDiagnostics = this.checkSyntax(program);
        //
        // if (syntaxDiagnostics.length) {
        //     return;
        // }
        //
        // const semanticDiagnostics = this.checkSemantics(program);
        //
        // if (semanticDiagnostics.length && this._options.noEmitOnError) {
        //     return;
        // }

        console.time('emit');
        const emitOutput = program.emit();
        console.timeEnd('emit');
        console.log(emitOutput);

        // const emittedDiagnostics = this.checkEmittedOutput(emitOutput);
        //
        // if (emittedDiagnostics.length && this._options.noEmitOnError) {
        //     return;
        // }
    };

    checkSyntax(program: EmitAndSemanticDiagnosticsBuilderProgram): readonly DiagnosticWithLocation[] {
        const syntaxDiagnostics = program.getSyntacticDiagnostics();

        for (let diagnostic of syntaxDiagnostics) {
            this.emit('error', new CompileError(diagnostic));
        }

        if (syntaxDiagnostics.length) {
            this._host.hasError = true;
        }

        return syntaxDiagnostics;
    };

    checkSemantics(program: EmitAndSemanticDiagnosticsBuilderProgram): readonly Diagnostic[] {
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

    transform(file: string): Transform {
        console.time('TRANS');

        const host = this._host;

        const getCompiledFile = (file: string): string => {
            return this.getCompiledFile(file);
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
                    console.timeEnd('TRANS');

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

    getCompiledFile(inputFile: string, alreadyMissedCache: boolean = false): string {
        const outputExtension = (this._options.jsx === JsxEmit.Preserve && this.isTsx(inputFile)) ? '.jsx' : '.js';

        let output = this._host.output(this.replaceFileExtension(inputFile, outputExtension));

        if (output === undefined) {
            if (alreadyMissedCache) {
                this.emit('error', new Error('tsify: no compiled file for ' + inputFile));
                return;
            }

            console.time('COMPILE');
            this.compile();
            console.timeEnd('COMPILE');

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

    setSourcePathInSourcemap(output: string, inputFile: string): string {
        const normalized = normalizePath(relativePath(
            process.cwd(),
            inputFile
        ));

        const sourcemap = fromComment(output);

        sourcemap.setProperty('sources', [normalized]);

        return output.replace(commentRegex, sourcemap.toComment());
    }
}
