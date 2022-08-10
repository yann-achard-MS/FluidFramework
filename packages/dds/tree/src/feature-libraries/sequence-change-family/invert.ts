/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangesetTag, isAttachGroup, OpId, Transposed as T } from "../../changeset";
import { fail } from "../../util";
import { SequenceChangeset } from "./sequenceChangeset";

const NO_TAG = "The input change must have a tag";

export function invert(change: SequenceChangeset): SequenceChangeset {
    const ranges = change.opRanges ?? fail(NO_TAG);
    // TODO: support the input change being a squash
    const tag = (ranges[0] ?? fail(NO_TAG)).tag;
    const opIdToTag = (id: OpId): ChangesetTag => {
        return tag;
    };
    const total: SequenceChangeset = {
        opRanges: [{ min: 0, tag: `-${tag}` }],
        marks: invertFieldMarks(change.marks, opIdToTag),
    };
    return total;
}

function invertFieldMarks(fieldMarks: T.FieldMarks, opIdToTag: (id: OpId) => ChangesetTag): T.FieldMarks {
    const inverseFieldMarks: T.FieldMarks = {};
    for (const key of Object.keys(fieldMarks)) {
        const markList = fieldMarks[key];
        inverseFieldMarks[key] = invertMarkList(markList, opIdToTag);
    }
    return inverseFieldMarks;
}

function invertMarkList(markList: T.MarkList, opIdToTag: (id: OpId) => ChangesetTag): T.MarkList {
    const inverseMarkList: T.MarkList = [];
    for (const mark of markList) {
        if (typeof mark === "number") {
            inverseMarkList.push(mark);
        } else if (isAttachGroup(mark)) {
            for (const attach of mark) {
                const type = attach.type;
                switch (type) {
                    case "Insert": {
                        inverseMarkList.push({
                            type: "Delete",
                            id: attach.id,
                            count: attach.content.length,
                        });
                        break;
                    }
                    case "MInsert": {
                        inverseMarkList.push({
                            type: "Delete",
                            id: attach.id,
                            count: 1,
                        });
                        break;
                    }
                    default: fail("Not implemented");
                }
            }
        } else {
            const type = mark.type;
            switch (type) {
                case "Delete": {
                    inverseMarkList.push({
                        type: "Revive",
                        id: mark.id,
                        tomb: opIdToTag(mark.id),
                        count: mark.count,
                    });
                    break;
                }
                case "Revive": {
                    inverseMarkList.push({
                        type: "Delete",
                        id: mark.id,
                        count: mark.count,
                    });
                    break;
                }
                case "Modify": {
                    const modify: T.Modify = {
                        type: "Modify",
                    };
                    if (mark.value !== undefined) {
                        modify.value = {
                            id: mark.value.id,
                            value: DUMMY_INVERSE_VALUE,
                        };
                    }
                    if (mark.fields !== undefined) {
                        modify.fields = invertFieldMarks(mark.fields, opIdToTag);
                    }
                    inverseMarkList.push(modify);
                    break;
                }
                default: fail("Not implemented");
            }
        }
    }
    return inverseMarkList;
}

/**
 * Dummy value used in place of actual repair data.
 * TODO: have `invert` access real repair data.
 */
export const DUMMY_INVERSE_VALUE = "Dummy inverse value";
