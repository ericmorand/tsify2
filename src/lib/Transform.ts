import {Transform as TransformStream, PassThrough} from "stream";
import {
    createIncrementalCompilerHost,
    createIncrementalProgram,
    EmitAndSemanticDiagnosticsBuilderProgram,
    JsxEmit,
    SourceFile,
    createProgram as nativeCreateProgram
} from "typescript";

import type {CustomOptions} from "browserify";
import type {Tsifier} from "./Tsifier";
import type {TransformCallback} from "stream";
import type {CompilerOptions, CreateProgram} from "typescript";

import {normalize as normalizePath, relative as relativePath} from "path";
import {commentRegex, fromComment} from "convert-source-map";

type BrowserifyTransform<T extends CustomOptions> = (file: string, options: T) => TransformStream;

export type TsifyTransformOptions = CustomOptions & {
    tsifier: Tsifier
};

// programs
const programs: Map<string, EmitAndSemanticDiagnosticsBuilderProgram> = new Map();

export const Transform = (compilerOptions: CompilerOptions): BrowserifyTransform<TsifyTransformOptions> => {
    const output: Map<string, string> = new Map();

    // compiler host
console.log('CREATE HOS', compilerOptions);

    const host = createIncrementalCompilerHost(compilerOptions);
    const nativeGetSourceFile = host.getSourceFile;

    host.writeFile = (fileName, data) => {
        console.log(fileName, data);

        output.set(fileName, data);
    };

    host.getSourceFile = (filename: string, languageVersion): SourceFile => {
        //this.emit('file', filename);

        return nativeGetSourceFile(filename, languageVersion);
    };



    return (file, options) => {
        console.log('TRANSFORM CALLED FOR', file);

        const isJavascript = (fileName: string): boolean => {
            return (/\.jsx?$/i).test(fileName);
        };

        const isTsx = (fileName: string): boolean => {
            return (/\.tsx$/i).test(fileName);
        };

        const isTypescript = (fileName: string): boolean => {
            return (/\.tsx?$/i).test(fileName);
        };

        const isTypescriptDeclaration = (fileName: string): boolean => {
            return (/\.d\.ts$/i).test(fileName);
        };

        const replaceFileExtension = (fileName: string, extension: string): string => {
            return fileName.replace(/\.\w+$/i, extension);
        };

        const setSourcePathInSourcemap = (output: string, inputFile: string): string => {
            const normalized = normalizePath(relativePath(
                process.cwd(),
                inputFile
            ));

            const sourcemap = fromComment(output);

            sourcemap.setProperty('sources', [normalized]);

            return output.replace(commentRegex, sourcemap.toComment());
        }

        console.time('TRANS');

        const getProgram = (options: CompilerOptions): EmitAndSemanticDiagnosticsBuilderProgram => {
            if (!programs.has(file)) {
                // const createProgram: CreateProgram<Program> = (rootNames, options, host, oldProgram, configFileParsingDiagnostics, projectReferences) => {
                //     return nativeCreateProgram(rootNames, options, host, oldProgram, configFileParsingDiagnostics);
                // };

                console.log('PROGRAM DONT EXIST');

                const rootNames = [file];

                programs.set(file, createIncrementalProgram({
                    rootNames,
                    options,
                    host
                }));
            }

            return programs.get(file);
        }

        const compile = (): boolean => {
            console.time('create p');
            const program = getProgram(compilerOptions);
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
            console.log(emitOutput);
            console.timeEnd('emit');

            // const emittedDiagnostics = this.checkEmittedOutput(emitOutput);

            // if (emittedDiagnostics.length && this._options.noEmitOnError) {
            //     return false;
            // }

            return true;
        };

        const getCompiledFile = (inputFile: string, alreadyMissedCache: boolean = false): string | undefined => {
            const outputExtension = (options.jsx === JsxEmit.Preserve && isTsx(inputFile)) ? '.jsx' : '.js';
            const outputKey: string = replaceFileExtension(inputFile, outputExtension);

            if (!output.has(outputKey)) {
                if (alreadyMissedCache) {
                    options.tsifier.emit('error', new Error('tsify: no compiled file for ' + inputFile));
                    return;
                }

                console.time('COMPILE');
                const success = compile();
                console.timeEnd('COMPILE');

                if (!success) {
                    return;
                }

                return getCompiledFile(inputFile, true);
            }

            if (options.inlineSourceMap) {
                output.set(outputKey, setSourcePathInSourcemap(
                    output.get(outputKey),
                    inputFile
                ));
            }

            return output.get(outputKey);
        };

        if (isTypescriptDeclaration(file)) {
            return new TransformStream({
                transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
                    callback();
                }
            });
        }

        if (isTypescript(file) || (isJavascript(file) && options.allowJs)) {
            return new TransformStream({
                transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
                    callback();
                },
                flush(callback: TransformCallback) {
                    const compiled = getCompiledFile(file);

                    console.timeEnd('TRANS');
                    console.log(compiled);

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
};
