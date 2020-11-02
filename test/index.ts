import * as Browserify from "browserify";
import Tsify from "../src";
import {Writable} from "stream";

import type {BrowserifyObject, Options as BrowserifyOptions} from "browserify";
import type {Options} from "../src";
import type {Error as CompileError} from "../src/lib/Error";

type RunCallback = (errors: Array<CompileError>, data: any, files: Array<string>) => void;
type BeforeBundleCallback = (browserify: BrowserifyObject) => void;
type OnTransformCallback = (transform: NodeJS.ReadWriteStream, file: string) => void;

type RunConfig = {
    tsifyOptions?: Options,
    browserifyOptions?: BrowserifyOptions,
    beforeBundle?: BeforeBundleCallback,
    onTransform?: OnTransformCallback
};

const tsify = Tsify({
    skipLibCheck: true,
    incremental: true
});

export const run = (config: RunConfig = {}, runCallback: RunCallback = () => undefined) => {
    const tsifyOptions = config.tsifyOptions || {};
    const browserifyOptions = config.browserifyOptions || {};

    browserifyOptions.standalone = '__';

    let beforeBundle = config.beforeBundle;

    if (!beforeBundle) {
        beforeBundle = () => undefined;
    }

    const files: Array<string> = [];

    const browserify = Browserify(browserifyOptions)
        .on('file', (file) => {
            files.push(file);
        })
        .on('transform', (transform, file) => {
            if (config.onTransform) {
                config.onTransform(transform, file);
            }
        })
        .plugin<Options>(tsify, tsifyOptions);

    beforeBundle(browserify);

    const errors: Array<CompileError> = [];

    let data: Buffer = Buffer.from('');

    const stream = new Writable({
        write(chunk: any, encoding: BufferEncoding, callback: (error?: (Error | null)) => void) {
            data = Buffer.concat([data, chunk]);

            callback();
        }
    }).on('finish', () => {
        console.timeEnd('run');

        const evaluator = new Function(`${data.toString()}return __;`);

        runCallback(errors, evaluator(), files);
    });

    console.time('run');
    browserify.bundle()
        .on('error', (error) => {
            errors.push(error);
        })
        .pipe(stream);

    return browserify;
};