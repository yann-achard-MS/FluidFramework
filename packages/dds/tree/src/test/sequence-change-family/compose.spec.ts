/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ProtoNode, Transposed as T, Value } from "../../changeset";
import { sequenceChangeRebaser, SequenceChangeset } from "../../feature-libraries";
import { TreeSchemaIdentifier } from "../../schema";
import { brand } from "../../util";
import { deepFreeze } from "../utils";

const type: TreeSchemaIdentifier = brand("Node");

function compose(...changes: SequenceChangeset[]): SequenceChangeset {
    changes.forEach(deepFreeze);
    return sequenceChangeRebaser.compose(...changes);
}

function setRootValueTo(value: Value): SequenceChangeset {
    return {
        marks: {
            root: [{
                type: "Modify",
                value: { type: "Set", value },
            }],
        },
    };
}

function setChildValueTo(value: Value): SequenceChangeset {
    return {
        marks: {
            root: [{
                type: "Modify",
                fields: {
                    foo: [
                        42,
                        {
                            type: "Modify",
                            value: { type: "Set", value },
                        },
                    ],
                },
            }],
        },
    };
}

describe("SequenceChangeFamily - Compose", () => {
    it("no changes", () => {
        const expected: SequenceChangeset = {
            marks: {},
        };
        const actual = compose();
        assert.deepEqual(actual, expected);
    });

    it("set root | set root", () => {
        const set1 = setRootValueTo(1);
        const set2 = setRootValueTo(2);
        const actual = compose(set1, set2);
        assert.deepEqual(actual, set2);
    });

    it("set root | set child", () => {
        const set1 = setChildValueTo(1);
        const set2 = setChildValueTo(2);
        const actual = compose(set1, set2);
        assert.deepEqual(actual, set2);
    });

    it("insert root | insert root", () => {
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
                    [{ type: "Insert", id: 3, content: [{ type, value: 3 }] }],
                    5,
                    [{ type: "Insert", id: 4, content: [{ type, value: 4 }] }],
                ],
            },
        };
        const actual = compose(insertA, insertB);
        // TODO: test tiebreak policy as well.
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 3, content: [{ type, value: 3 }] }],
                    [{ type: "Insert", id: 1, content: [{ type, value: 1 }] }],
                    2,
                    [{ type: "Insert", id: 2, content: [{ type, value: 2 }] }],
                    3,
                    [{ type: "Insert", id: 4, content: [{ type, value: 4 }] }],
                ],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("insert child | insert child", () => {
        const insertA: SequenceChangeset = {
            marks: {
                root: [{
                    type: "Modify",
                    fields: {
                        foo: [
                            [{ type: "Insert", id: 1, content: [{ type, value: 1 }] }],
                        ],
                        bar: [
                            [{ type: "Insert", id: 2, content: [{ type, value: 2 }] }],
                        ],
                    },
                }],
            },
        };
        const insertB: SequenceChangeset = {
            marks: {
                root: [{
                    type: "Modify",
                    fields: {
                        bar: [
                            1,
                            [{ type: "Insert", id: 3, content: [{ type, value: 3 }] }],
                        ],
                        baz: [
                            [{ type: "Insert", id: 4, content: [{ type, value: 4 }] }],
                        ],
                    },
                }],
            },
        };
        const actual = compose(insertA, insertB);
        const expected: SequenceChangeset = {
            marks: {
                root: [{
                    type: "Modify",
                    fields: {
                        foo: [
                            [{ type: "Insert", id: 1, content: [{ type, value: 1 }] }],
                        ],
                        bar: [
                            [{ type: "Insert", id: 2, content: [{ type, value: 2 }] }],
                            1,
                            [{ type: "Insert", id: 3, content: [{ type, value: 3 }] }],
                        ],
                        baz: [
                            [{ type: "Insert", id: 4, content: [{ type, value: 4 }] }],
                        ],
                    },
                }],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("delete root | delete root", () => {
        // Deletes ABC-----IJKLM
        const deleteA: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 1, count: 3 },
                    5,
                    { type: "Delete", id: 2, count: 5 },
                ],
            },
        };
        // Deletes ABCD--GHIJK
        const deleteB: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 3, count: 4 },
                    2,
                    { type: "Delete", id: 4, count: 5 },
                ],
            },
        };
        const actual = compose(deleteA, deleteB);
        // TODO: test tiebreak policy as well.
        // TODO: expect the last two marks to be merged.
        // Deletes ABCD--GHIJKLM
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 1, count: 3 },
                    { type: "Delete", id: 3, count: 1 },
                    2,
                    { type: "Delete", id: 4, count: 2 },
                    { type: "Delete", id: 2, count: 3 },
                    { type: "Delete", id: 2, count: 2 },
                ],
            },
        };
        assert.deepEqual(actual, expected);
    });
});
