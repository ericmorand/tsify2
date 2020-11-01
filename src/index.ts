import {Tsifier} from "./lib/Tsifier";
import {Transform} from "stream";
import {resolve, isAbsolute} from "path";
import {realpathSync} from "fs";

import type {BrowserifyObject, Options as BrowserifyOptions} from "browserify";
import type {CompilerOptions} from "typescript";

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
    _options: BrowserifyOptions,
    _extensions: Array<string>
};

/**
 * Unfortunately, there is no documentation for TypeScript CompilerOptions type.
 * @see https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API
 * @see https://www.typescriptlang.org/docs/handbook/compiler-options.html
 */
export type Options = CompilerOptions;

const tsify = (browserify: BrowserifyObject | string, options: Options): void => {
    if (typeof browserify === 'string') {
        throw new Error('tsify appears to have been configured as a transform; it must be configured as a plugin.');
    }

    const tsifier = new Tsifier(options, (browserify as BrowserifyObjectWithMissingProperties)._options);

    tsifier.on('error', function (error) {
        browserify.pipeline.emit('error', error);
    });

    tsifier.on('file', function (file, id) {
        browserify.emit('file', file, id);
    });

    const gatherEntryPoints = () => {
        const rows: Array<Row> = [];

        return new Transform({
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
                    return file;
                }).map((file) => {
                    return realpathSync(file);
                });

                tsifier.reset();
                tsifier.generateCache(entryFiles, ignoredFiles);

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

        if (options.jsx && browserifyWithMissingProperties._extensions.indexOf('.tsx') === -1) {
            browserifyWithMissingProperties._extensions.unshift('.tsx');
        }

        if (browserifyWithMissingProperties._extensions.indexOf('.ts') === -1) {
            browserifyWithMissingProperties._extensions.unshift('.ts');
        }

        browserify.pipeline.get('record').push(gatherEntryPoints());
    }

    setupPipeline();

    browserify.transform(tsifier.transform.bind(tsifier));

    browserify.on('reset', function () {
        setupPipeline();
    });
};

export default tsify;
