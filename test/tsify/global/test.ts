import * as tape from "tape";
import {run} from "../../index";

tape('tsify', (test) => {
    test.test('supports global option', (test) => {
        test.test('when set to false', (test) => {
            let transformedFiles: Array<string> = [];

            run({
                tsifyOptions: {
                    global: false,
                    compiler: {
                        allowJs: true
                    }
                },
                browserifyOptions: {
                    entries: ['test/tsify/global/main.ts']
                },
                onTransform: (transform, file) => {
                    transformedFiles.push(file);
                }
            }, () => {
                test.same(transformedFiles.length, 3);

                test.end();
            });
        });

        test.test('when set to true', (test) => {
            let transformedFiles: Array<string> = [];

            run({
                tsifyOptions: {
                    global: true,
                    compiler: {
                        allowJs: true
                    }
                },
                browserifyOptions: {
                    entries: ['test/tsify/global/main.ts']
                },
                onTransform: (transform, file) => {
                    transformedFiles.push(file);
                }
            }, () => {
                test.same(transformedFiles.length, 4);

                test.end();
            });
        });
    });
});