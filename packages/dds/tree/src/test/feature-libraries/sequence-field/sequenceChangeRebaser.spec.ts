/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF } from "../../../feature-libraries";
import { makeAnonChange, RevisionTag, tagChange, tagInverse } from "../../../rebase";
import { TreeSchemaIdentifier } from "../../../schema-stored";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import { deepFreeze } from "../../utils";
import { checkDeltaEquality, rebaseTagged, toDelta } from "./utils";
import { ChangeMaker as Change } from "./testEdits";

const type: TreeSchemaIdentifier = brand("Node");
const tag1: RevisionTag = brand(41);
const tag2: RevisionTag = brand(42);
const tag3: RevisionTag = brand(43);

const testMarks: [string, SF.Mark<TestChange>][] = [
    ["SetValue", { type: "Modify", changes: TestChange.mint([], 1) }],
    ["MInsert", { type: "MInsert", content: { type, value: 42 }, changes: TestChange.mint([], 2) }],
    [
        "Insert",
        {
            type: "Insert",
            content: [
                { type, value: 42 },
                { type, value: 43 },
            ],
        },
    ],
    ["Delete", { type: "Delete", count: 2 }],
    ["Revive", { type: "Revive", count: 2, detachedBy: tag1, detachIndex: 0 }],
    [
        "MutedRevive",
        {
            type: "Revive",
            count: 2,
            detachedBy: tag2,
            detachIndex: 0,
            mutedBy: tag3,
        },
    ],
];
deepFreeze(testMarks);

describe("SequenceField - Rebaser Axioms", () => {
    /**
     * This test simulates rebasing over an do-undo pair.
     */
    describe("A ↷ [B, B⁻¹] === A", () => {
        for (const [name1, mark1] of testMarks) {
            for (const [name2, mark2] of testMarks) {
                if (name2 === "Delete" && ["SetValue", "Delete"].includes(name1)) {
                    it.skip(`(${name1} ↷ ${name2}) ↷ ${name2}⁻¹ => ${name1}`, () => {
                        /**
                         * These cases are currently disabled because marks that affect existing content are removed
                         * instead of muted when rebased over the deletion of that content.
                         * This prevents us from then reinstating the mark when rebasing over the revive.
                         */
                    });
                } else {
                    it(`(${name1} ↷ ${name2}) ↷ ${name2}⁻¹ => ${name1}`, () => {
                        for (let offset1 = 1; offset1 <= 4; ++offset1) {
                            for (let offset2 = 1; offset2 <= 4; ++offset2) {
                                const change1 = tagChange([offset1, mark1], brand(1));
                                const change2 = tagChange([offset2, mark2], brand(2));
                                const inv = tagInverse(
                                    SF.invert(change2, TestChange.invert),
                                    change2.revision,
                                );
                                const r1 = rebaseTagged(change1, change2);
                                const r2 = rebaseTagged(r1, inv);
                                checkDeltaEquality(r2.change, change1.change);
                            }
                        }
                    });
                }
            }
        }
    });

    /**
     * This test simulates sandwich rebasing:
     * a change is first rebased over the inverse of a change it took for granted
     * then rebased over the updated version of that change (the same as the original in our case).
     *
     * The first rebase (A ↷ B) is purely for the purpose of manufacturing a change to which we can
     * apply the inverse of some change.
     */
    describe("(A ↷ B) ↷ [B⁻¹, B] === A ↷ B", () => {
        for (const [name1, mark1] of testMarks) {
            for (const [name2, mark2] of testMarks) {
                it(`${name1} ↷ [${name2}, ${name2}⁻¹, ${name2}] => ${name1} ↷ ${name2}`, () => {
                    for (let offset1 = 1; offset1 <= 4; ++offset1) {
                        for (let offset2 = 1; offset2 <= 4; ++offset2) {
                            const change1 = [offset1, mark1];
                            const change2 = [offset2, mark2];
                            const inverse2 = SF.invert(makeAnonChange(change2), TestChange.invert);
                            const r1 = SF.rebase(
                                change1,
                                makeAnonChange(change2),
                                TestChange.rebase,
                            );
                            const r2 = SF.rebase(r1, makeAnonChange(inverse2), TestChange.rebase);
                            const r3 = SF.rebase(r2, makeAnonChange(change2), TestChange.rebase);
                            assert.deepEqual(r3, r1);
                        }
                    }
                });
            }
        }
    });

    describe("A ○ A⁻¹ === ε", () => {
        for (const [name, mark] of testMarks) {
            it(`${name} ○ ${name}⁻¹ === ε`, () => {
                const change = [mark];
                const taggedChange = tagChange(change, brand(1));
                const inv = SF.invert(taggedChange, TestChange.invert);
                const actual = SF.compose(
                    [taggedChange, tagInverse(inv, taggedChange.revision)],
                    TestChange.compose,
                );
                const delta = toDelta(actual);
                assert.deepEqual(delta, []);
            });
        }
    });

    describe("A⁻¹ ○ A === ε", () => {
        for (const [name, mark] of testMarks) {
            if (name === "Insert" || name === "MInsert") {
                // A⁻¹ ○ A === ε cannot be true for Insert/MInsert:
                // Re-inserting nodes after deleting them is different from not having deleted them in the first place.
                // We may reconsider this in the future in order to minimize the deltas produced when rebasing local changes.
            } else {
                it(`${name}⁻¹ ○ ${name} === ε`, () => {
                    const change = [mark];
                    const taggedChange = tagChange(change, brand(1));
                    const inv = SF.invert(taggedChange, TestChange.invert);
                    const actual = SF.compose(
                        [tagInverse(inv, taggedChange.revision), taggedChange],
                        TestChange.compose,
                    );
                    const delta = toDelta(actual);
                    assert.deepEqual(delta, []);
                });
            }
        }
    });
});

describe("SequenceField - Sandwich Rebasing", () => {
    it("Nested inserts", () => {
        const insertA = tagChange(Change.insert(0, 2), brand(1));
        const insertB = tagChange(Change.insert(1, 1), brand(2));
        const inverseA = SF.invert(insertA, TestChange.invert);
        const insertB2 = rebaseTagged(insertB, tagInverse(inverseA, insertA.revision));
        const insertB3 = rebaseTagged(insertB2, insertA);
        assert.deepEqual(insertB3.change, insertB.change);
    });

    it("Nested inserts ↷ adjacent insert", () => {
        const insertX = tagChange(Change.insert(0, 1), brand(1));
        const insertA = tagChange(Change.insert(1, 2), brand(2));
        const insertB = tagChange(Change.insert(2, 1), brand(3));
        const inverseA = SF.invert(insertA, TestChange.invert);
        const insertA2 = rebaseTagged(insertA, insertX);
        const insertB2 = rebaseTagged(insertB, tagInverse(inverseA, insertA.revision));
        const insertB3 = rebaseTagged(insertB2, insertX);
        const insertB4 = rebaseTagged(insertB3, insertA2);
        assert.deepEqual(insertB4.change, Change.insert(3, 1));
    });

    it("[Delete ABC, Revive ABC] ↷ Delete B", () => {
        const delB = tagChange(Change.delete(1, 1), brand(1));
        const delABC = tagChange(Change.delete(0, 3), brand(2));
        const revABC = tagChange(Change.revive(0, 3, 0, brand(2)), brand(3));
        const delABC2 = rebaseTagged(delABC, delB);
        const invDelABC = SF.invert(delABC, TestChange.invert);
        const revABC2 = rebaseTagged(revABC, tagInverse(invDelABC, delABC2.revision));
        const revABC3 = rebaseTagged(revABC2, delB);
        const revABC4 = rebaseTagged(revABC3, delABC2);
        const actual = SF.compose([delABC2, revABC4], TestChange.compose);
        const delta = toDelta(actual);
        assert.deepEqual(delta, []);
    });

    it("[Delete AC, Revive AC] ↷ Insert B", () => {
        const addB = tagChange(Change.insert(1, 1), brand(1));
        const delAC = tagChange(Change.delete(0, 2), brand(2));
        const revAC = tagChange(Change.revive(0, 2, 0, brand(2)), brand(3));
        const delAC2 = rebaseTagged(delAC, addB);
        const invDelAC = SF.invert(delAC, TestChange.invert);
        const revAC2 = rebaseTagged(revAC, tagInverse(invDelAC, delAC2.revision));
        const revAC3 = rebaseTagged(revAC2, addB);
        const revAC4 = rebaseTagged(revAC3, delAC2);
        const actual = SF.compose([delAC2, revAC4], TestChange.compose);
        const delta = toDelta(actual);
        assert.deepEqual(delta, []);
    });
});
