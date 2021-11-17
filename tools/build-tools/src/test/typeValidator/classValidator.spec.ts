/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import os from "os";
import { Project, SourceFile } from "ts-morph"
import {
    BreakingIncrement,
    checkMajorIncrement,
    checkMinorIncrement,
    DecompositionTypeData,
    tryDecomposeTypeData,
} from "./../../typeValidator/packageValidator";
import { enableLogging } from "./../../typeValidator/validatorUtils"

describe("Class", () => {
    enableLogging(true);
    let project: Project;
    let pkgDir: string = os.tmpdir();
    beforeEach(() => {
        project = new Project({
            skipFileDependencyResolution: true,
        });
        assert(project !== undefined);
    });

    function getTypeDataForSource(sourceFile: SourceFile): DecompositionTypeData {
        let typeData: DecompositionTypeData;
        for (const declarations of sourceFile.getExportedDeclarations().values()) {
            typeData = { kind: "unknown", name: "typeName", node: declarations[0] } as any as DecompositionTypeData;
            tryDecomposeTypeData(project.getTypeChecker(), typeData);
            break;
        }
        return typeData!;
    }

    it("new method", () => {
        const classOld = `
export class asdf {}
`;
        const oldSourceFile = project.createSourceFile(`${pkgDir}/src/classOld.ts`, classOld);
        const oldTypeData = getTypeDataForSource(oldSourceFile);

        const classNew = `
export class asdf {
    public qewr() { return false; }
}
`;
        const newSourceFile = project.createSourceFile(`${pkgDir}/src/classNew.ts`, classNew);
        const newTypeData = getTypeDataForSource(newSourceFile);

        let increment = checkMajorIncrement(project, pkgDir, oldTypeData, newTypeData);
        assert(increment === BreakingIncrement.major);

        increment = checkMinorIncrement(project, pkgDir, oldTypeData, newTypeData);
        assert(increment == BreakingIncrement.none);

    }).timeout(10000);
});
