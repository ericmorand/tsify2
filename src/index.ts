import {Tsifier} from "./lib/Tsifier";
import {Transform as TransformStream} from "stream";
import {resolve, isAbsolute} from "path";
import {realpathSync} from "fs";
import {ModuleKind} from "typescript";
import {Transform} from "./lib/Transform";

import type {BrowserifyObject, CustomOptions, Options as BrowserifyOptions} from "browserify";
import type {CompilerOptions} from "typescript";
import type {TsifyTransformOptions} from "./lib/Transform";

import type {TransformOptions} from "./lib/Tsifier";
import {Host} from "./lib/Host";

/**
 * @internal
 */
type Row = {
    file?: string,
    id?: string,
    source?: string,
    basedir?: string
};

/**
 * @internal
 */
type BrowserifyObjectWithMissingProperties = BrowserifyObject & {
    _options: BrowserifyOptions & {
        global: boolean
    },
    _extensions: Array<string>
};

export type Options = {
    global?: boolean
};

type BrowserifyPlugin<T extends CustomOptions> = (browserify: BrowserifyObject | string, options: T) => void;

/**
 * Unfortunately, there is no documentation for TypeScript CompilerOptions type.
 * @see https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API
 * @see https://www.typescriptlang.org/docs/handbook/compiler-options.html
 */
const Tsify = (compilerOptions: CompilerOptions = {}): BrowserifyPlugin<Options> => {
    compilerOptions.module = compilerOptions.module || ModuleKind.CommonJS;

    const tsifier = new Tsifier(compilerOptions);

    return (browserify, options) => {
        if (typeof browserify === 'string') {
            throw new Error('tsify appears to have been configured as a transform; it must be configured as a plugin.');
        }

        tsifier.on('error', (error) => {
            browserify.pipeline.emit('error', error);
        });

        tsifier.on('file', (file, id) => {
            browserify.emit('file', file, id);
        });

        const gatherEntryPoints = () => {
            const rows: Array<Row> = [];

            return new TransformStream({
                objectMode: true,
                transform(row: any, enc, next) {
                    rows.push(row);

                    next();
                },
                flush(next) {
                    const ignoredFiles: Array<string> = [];

                    const entryFiles: Array<string> = rows.map((row) => {
                        const file = row.file || row.id;

                        if (file) {
                            if (row.source !== undefined) {
                                ignoredFiles.push(file);
                            } else if (row.basedir) {
                                return resolve(row.basedir, file);
                            } else if (isAbsolute(file)) {
                                return file;
                            } else {
                                ignoredFiles.push(file);
                            }
                        }

                        return null;
                    }).filter((file) => {
                        return file !== null;
                    });

                    tsifier.addFiles(entryFiles);

                    for (let row of rows) {
                        this.push(row);
                    }

                    this.push(null);

                    next();
                }
            });
        }

        const setupPipeline = () => {
            const browserifyWithMissingProperties: BrowserifyObjectWithMissingProperties = (browserify as BrowserifyObjectWithMissingProperties);

            if (compilerOptions.jsx && browserifyWithMissingProperties._extensions.indexOf('.tsx') === -1) {
                browserifyWithMissingProperties._extensions.unshift('.tsx');
            }

            if (browserifyWithMissingProperties._extensions.indexOf('.ts') === -1) {
                browserifyWithMissingProperties._extensions.unshift('.ts');
            }

            browserify.pipeline.get('record').push(gatherEntryPoints());
        }

        setupPipeline();

        browserify.transform<TsifyTransformOptions>(Transform(compilerOptions), {
            tsifier: tsifier
        });

        browserify.on('reset', function () {
            setupPipeline();
        });
    }
};

export default Tsify;
