/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { sequenceChangeRebaser, SequenceChangeset } from "../../feature-libraries";
import { TreeSchemaIdentifier } from "../../schema";
import { brand } from "../../util";
import { deepFreeze } from "../utils";
import { cases, setChildValueTo, setRootValueTo } from "./cases";

const type: TreeSchemaIdentifier = brand("Node");

function rebase(change: SequenceChangeset, base: SequenceChangeset): SequenceChangeset {
    deepFreeze(change);
    deepFreeze(base);
    return sequenceChangeRebaser.rebase(change, base);
}

describe("SequenceChangeFamily - rebase", () => {
    describe("no changes ↷ *", () => {
        for (const [name, testCase] of Object.entries(cases)) {
            it(`no changes ↷ ${name}`, () => {
                const actual = rebase(cases.no_change, testCase);
                assert.deepEqual(actual, cases.no_change);
            });
        }
    });

    describe("* ↷ no changes", () => {
        for (const [name, testCase] of Object.entries(cases)) {
            it(`${name} ↷ no changes`, () => {
                const actual = rebase(testCase, cases.no_change);
                assert.deepEqual(actual, testCase);
            });
        }
    });

    it("set root ↷ set root", () => {
        const set1 = setRootValueTo(1);
        const set2 = setRootValueTo(2);
        const actual = rebase(set1, set2);
        assert.deepEqual(actual, set1);
    });

    it("set root ↷ set child", () => {
        const set1 = setRootValueTo(1);
        const set2 = setChildValueTo(2);
        const actual = rebase(set1, set2);
        assert.deepEqual(actual, set1);
    });

    it("set child ↷ set root", () => {
        const set1 = setChildValueTo(1);
        const set2 = setRootValueTo(2);
        const actual = rebase(set1, set2);
        assert.deepEqual(actual, set1);
    });

    it("set child ↷ set child", () => {
        const set1 = setChildValueTo(1);
        const set2 = setChildValueTo(2);
        const actual = rebase(set1, set2);
        assert.deepEqual(actual, set1);
    });

    it("insert ↷ modify", () => {
        const actual = rebase(cases.insert, cases.modify);
        assert.deepEqual(actual, cases.insert);
    });

    it("modify insert ↷ modify", () => {
        const actual = rebase(cases.modify_insert, cases.modify);
        assert.deepEqual(actual, cases.modify_insert);
    });

    it("delete ↷ modify", () => {
        const actual = rebase(cases.delete, cases.modify);
        assert.deepEqual(actual, cases.delete);
    });

    it("set ↷ delete", () => {
        const sets: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Modify", value: { id: 0, value: 42 } },
                    2,
                    { type: "Modify", value: { id: 0, value: 42 } },
                    4,
                    { type: "Modify", value: { id: 0, value: 42 } },
                ],
            },
        };
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    1,
                    { type: "Delete", id: 1, count: 3 },
                ],
            },
        };
        const actual = rebase(sets, deletion);
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    // Set at an earlier index is unaffected by a delete at a later index
                    { type: "Modify", value: { id: 0, value: 42 } },
                    // Set as the same index as a delete is muted by the delete
                    4,
                    // Set at a later index moves to an earlier index due to a delete at an earlier index
                    { type: "Modify", value: { id: 0, value: 42 } },
                ],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("modify ↷ delete", () => {
        const mods: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Modify", fields: { foo: [{ type: "Delete", id: 1, count: 1 }] } },
                    2,
                    { type: "Modify", fields: { foo: [{ type: "Delete", id: 2, count: 1 }] } },
                    4,
                    { type: "Modify", fields: { foo: [{ type: "Delete", id: 3, count: 1 }] } },
                ],
            },
        };
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    1,
                    { type: "Delete", id: 1, count: 3 },
                ],
            },
        };
        const actual = rebase(mods, deletion);
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    // Set at an earlier index is unaffected by a delete at a later index
                    { type: "Modify", fields: { foo: [{ type: "Delete", id: 1, count: 1 }] } },
                    // Set as the same index as a delete is muted by the delete
                    4,
                    // Set at a later index moves to an earlier index due to a delete at an earlier index
                    { type: "Modify", fields: { foo: [{ type: "Delete", id: 3, count: 1 }] } },
                ],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("insert ↷ delete", () => {
        const insert: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 1 }] }],
                    2,
                    [{ type: "Insert", id: 2, content: [{ type, value: 2 }] }],
                    4,
                    [{ type: "Insert", id: 3, content: [{ type, value: 3 }] }],
                ],
            },
        };
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    1,
                    { type: "Delete", id: 1, count: 3 },
                ],
            },
        };
        const actual = rebase(insert, deletion);
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    2, // Insert at earlier index increases the index of the delete
                    { type: "Delete", id: 1, count: 2 },
                    1, // Insert within the delete splits the delete
                    { type: "Delete", id: 1, count: 1 },
                    // Insert after the delete has no impact on the delete
                ],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ overlapping delete", () => {
        // Deletes ---DEFGH--
        const deleteA: SequenceChangeset = {
            marks: {
                root: [
                    3,
                    { type: "Delete", id: 2, count: 5 },
                ],
            },
        };
        // Deletes --CD-F-HI
        const deleteB: SequenceChangeset = {
            marks: {
                root: [
                    2,
                    { type: "Delete", id: 1, count: 2 },
                    1,
                    { type: "Delete", id: 2, count: 1 },
                    1,
                    { type: "Delete", id: 2, count: 2 },
                ],
            },
        };
        const actual = rebase(deleteA, deleteB);
        // Deletes --E-G
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    2,
                    { type: "Delete", id: 2, count: 1 },
                    1,
                    { type: "Delete", id: 2, count: 1 },
                ],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ earlier delete", () => {
        // Deletes ---DE
        const deleteA: SequenceChangeset = {
            marks: {
                root: [
                    2,
                    { type: "Delete", id: 2, count: 2 },
                ],
            },
        };
        // Deletes AB--
        const deleteB: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 1, count: 2 },
                ],
            },
        };
        const actual = rebase(deleteA, deleteB);
        // Deletes -DE
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    1,
                    { type: "Delete", id: 2, count: 2 },
                ],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ later delete", () => {
        // Deletes AB--
        const deleteA: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 1, count: 2 },
                ],
            },
        };
        // Deletes ---DE
        const deleteB: SequenceChangeset = {
            marks: {
                root: [
                    2,
                    { type: "Delete", id: 2, count: 2 },
                ],
            },
        };
        const actual = rebase(deleteA, deleteB);
        assert.deepEqual(actual, deleteA);
    });

    it("set ↷ insert", () => {
        const sets: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Modify", value: { id: 0, value: 42 } },
                    2,
                    { type: "Modify", value: { id: 0, value: 42 } },
                ],
            },
        };
        const insert: SequenceChangeset = {
            marks: {
                root: [
                    2,
                    [{ type: "Insert", id: 1, content: [{ type, value: 2 }] }],
                ],
            },
        };
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    // Set at earlier index is unaffected
                    { type: "Modify", value: { id: 0, value: 42 } },
                    3,
                    // Set at later index has its index increased
                    { type: "Modify", value: { id: 0, value: 42 } },
                ],
            },
        };
        const actual = rebase(sets, insert);
        assert.deepEqual(actual, expected);
    });

    it("modify ↷ insert", () => {
        const mods: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Modify", fields: { foo: [{ type: "Delete", id: 1, count: 1 }] } },
                    2,
                    { type: "Modify", fields: { foo: [{ type: "Delete", id: 1, count: 1 }] } },
                ],
            },
        };
        const insert: SequenceChangeset = {
            marks: {
                root: [
                    2,
                    [{ type: "Insert", id: 1, content: [{ type, value: 2 }] }],
                ],
            },
        };
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    // Modify at earlier index is unaffected
                    { type: "Modify", fields: { foo: [{ type: "Delete", id: 1, count: 1 }] } },
                    3,
                    // Modify at later index has its index increased
                    { type: "Modify", fields: { foo: [{ type: "Delete", id: 1, count: 1 }] } },
                ],
            },
        };
        const actual = rebase(mods, insert);
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ insert", () => {
        // Deletes A-CD-E
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 1, count: 1 },
                    1,
                    { type: "Delete", id: 1, count: 2 },
                    1,
                    { type: "Delete", id: 1, count: 1 },
                ],
            },
        };
        // Inserts between C and D
        const insert: SequenceChangeset = {
            marks: {
                root: [
                    3,
                    [{ type: "Insert", id: 1, content: [{ type, value: 2 }] }],
                ],
            },
        };
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    // Delete with earlier index is unaffected
                    { type: "Delete", id: 1, count: 1 },
                    1,
                    { type: "Delete", id: 1, count: 1 },
                    1, // Delete at overlapping index is split
                    { type: "Delete", id: 1, count: 1 },
                    1,
                    // Delete at later index has its index increased
                    { type: "Delete", id: 1, count: 1 },
                ],
            },
        };
        const actual = rebase(deletion, insert);
        assert.deepEqual(actual, expected);
    });

    it("insert ↷ insert", () => {
        const insertA: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 1 }] }],
                    2,
                    [{ type: "Insert", id: 2, content: [{ type, value: 2 }] }],
                ],
            },
        };
        const insertB: SequenceChangeset = {
            marks: {
                root: [
                    1,
                    [{ type: "Insert", id: 3, content: [{ type, value: 3 }] }],
                ],
            },
        };
        const actual = rebase(insertA, insertB);
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 1 }] }],
                    3,
                    [{ type: "Insert", id: 2, content: [{ type, value: 2 }] }],
                ],
            },
        };
        assert.deepEqual(actual, expected);
    });
});
