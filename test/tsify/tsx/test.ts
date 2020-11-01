import * as tape from "tape";
import {run} from "../../index";
import {JsxEmit} from "typescript";

tape('tsify', (test) => {
    test.test('handles .tsx sources', (test) => {
        run({
            browserifyOptions: {
              entries: ['test/tsify/tsx/main.ts']
            },
            tsifyOptions: {
                jsx: JsxEmit.React
            }
        }, (errors, actual) => {
            test.same(errors.length, 0);
            test.same(actual, 'div with children: This is a cool component');

            test.end();
        })
    });
});