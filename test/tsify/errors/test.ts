import * as tape from "tape";
import {run} from "../../index";
import {resolve as resolvePath} from "path";

tape('tsify', (test) => {
    test.test('handles syntax errors', (test) => {
        run({
            browserifyOptions: {
              entries: ['test/tsify/errors/syntax.ts']
            }
        }, (errors) => {
            test.true(errors.length);
            test.same(errors[0].line, 1);
            test.same(errors[0].column, 14);
            test.same(errors[0].fileName, resolvePath('test/tsify/errors/syntax.ts'));

            test.end();
        })
    });

    test.test('handles semantic errors', (test) => {
        run({
            browserifyOptions: {
                entries: ['test/tsify/errors/semantic.ts']
            }
        }, (errors) => {
            test.true(errors.length);
            test.same(errors[0].line, 1);
            test.same(errors[0].column, 7);
            test.same(errors[0].fileName, resolvePath('test/tsify/errors/semantic.ts'));

            test.end();
        })
    });
});