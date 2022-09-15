/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { NodeChangeset } from "../../../feature-libraries";
import { FieldKey } from "../../../tree";
import { brand } from "../../../util";
import { generateRandomChange } from "./randomSequenceGenerator";

const testSeed = 432167897;
const maxIndex = 3;
const childGen = (seed: number): NodeChangeset => ({ valueChange: { value: seed } });

describe("generateRandomChange", () => {
    it("generates the same change given the same seed", () => {
        const change1 = generateRandomChange(testSeed, maxIndex, childGen);
        const change2 = generateRandomChange(testSeed, maxIndex, childGen);
        assert.deepStrictEqual(change1, change2);
    });

    it("generates different changes given the different seeds", () => {
        const change1 = generateRandomChange(testSeed, maxIndex, childGen);
        const change2 = generateRandomChange(testSeed + 1, maxIndex, childGen);
        assert.notDeepStrictEqual(change1, change2);
    });

    it("Generates a change", () => {
        const change = generateRandomChange(testSeed, maxIndex, childGen);
        const expected = [{}]; // TODO: update this with test output
        assert.deepStrictEqual(change, expected);
    });
});
