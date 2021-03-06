import {DiagnosticCategory, getLineAndCharacterOfPosition, flattenDiagnosticMessageText} from "typescript";
import type {Diagnostic, DiagnosticWithLocation} from "typescript";
import {EOL} from "os";

export class Error extends SyntaxError {
    private readonly _fileName: string;
    private readonly _line: number;
    private readonly _column: number;

    constructor(diagnostic: Diagnostic | DiagnosticWithLocation) {
        const category = DiagnosticCategory[diagnostic.category];

        let fileName: string;
        let line: number;
        let column: number;

        let message = category + ' TypeScript' + diagnostic.code + ': ' + flattenDiagnosticMessageText(diagnostic.messageText, EOL);

        if (diagnostic.file) {
            const location = getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start);
            const category = DiagnosticCategory[diagnostic.category];

            fileName = diagnostic.file.fileName;
            line = location.line + 1;
            column = location.character + 1;

            message += fileName + '(' + line + ',' + column + '): ' + category + ' TypeScript' + diagnostic.code + ': ' + flattenDiagnosticMessageText(diagnostic.messageText, EOL);
        }

        super(message);

        this.name = 'TypeScript error';

        this._fileName = fileName;
        this._line = line;
        this._column = column;
    }

    get fileName(): string {
        return this._fileName;
    }

    get line(): number {
        return this._line;
    }

    get column(): number {
        return this._column;
    }
}
