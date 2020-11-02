import * as tape from "tape";
import {run} from "../../index";

tape('tsify', (test) => {
    test.test('when set to false', (test) => {
        run({
            browserifyOptions: {
                entries: ['test/tsify/incremental/main.ts']
            }
        }, (errors, data, files) => {
            run({
                browserifyOptions: {
                    entries: ['test/tsify/incremental/main2.ts']
                }
            }, (errors, data, files) => {
                test.end();
            });
        });
    });
});