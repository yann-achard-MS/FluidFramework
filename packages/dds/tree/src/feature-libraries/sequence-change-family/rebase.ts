/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getMarkLength, isAttachGroup, isReattach, MarkListFactory, splitMark, Transposed as T } from "../../changeset";
import { clone, fail } from "../../util";
import { SequenceChangeset } from "./sequenceChangeset";

export function rebase(change: SequenceChangeset, base: SequenceChangeset): SequenceChangeset {
    const fields = rebaseFieldMarks(change.marks, base.marks);
    return {
        marks: fields,
    };
}

function rebaseFieldMarks(change: T.FieldMarks, base: T.FieldMarks): T.FieldMarks {
    const fields: T.FieldMarks = {};
    for (const key of Object.keys(change)) {
        if (key in base) {
            fields[key] = rebaseMarkList(change[key], base[key]);
        } else {
            fields[key] = clone(change[key]);
        }
    }
    return fields;
}

function rebaseMarkList(currMarkList: T.MarkList, baseMarkList: T.MarkList): T.MarkList {
    const factory = new MarkListFactory();
    let iBase = 0;
    let iCurr = 0;
    let nextCurrMark: T.Mark | undefined = currMarkList[iCurr];
    let nextBaseMark: T.Mark | undefined = baseMarkList[iBase];
    while (nextCurrMark !== undefined && nextBaseMark !== undefined) {
        let currMark: T.Mark = nextCurrMark;
        let baseMark: T.Mark = nextBaseMark;
        nextCurrMark = undefined;
        nextBaseMark = undefined;

        if (isAttachGroup(currMark) || isReattach(currMark)) {
            // TODO: respect tiebreak
            factory.pushContent(clone(currMark));
            nextBaseMark = baseMark;
        } else if (isAttachGroup(baseMark) || isReattach(baseMark)) {
            factory.pushOffset(getMarkLength(baseMark));
            nextCurrMark = currMark;
        } else {
            const currMarkLength = getMarkLength(currMark);
            const baseMarkLength = getMarkLength(baseMark);
            if (currMarkLength < baseMarkLength) {
                [baseMark, nextBaseMark] = splitMark(baseMark, currMarkLength);
            } else if (currMarkLength > baseMarkLength) {
                [currMark, nextCurrMark] = splitMark(currMark, baseMarkLength);
            }
            const rebasedMark = rebaseMark(currMark, baseMark);
            // Passed this point, we are guaranteed that:
            //  * `currMark` and `baseMark` have the same length
            //  * `currMark` and `baseMark` are `T.SizedMark`s
            factory.push(rebasedMark);
        }
        if (nextCurrMark === undefined) {
            iCurr += 1;
            nextCurrMark = currMarkList[iCurr];
        }
        if (nextBaseMark === undefined) {
            iBase += 1;
            nextBaseMark = baseMarkList[iBase];
        }
    }
    if (nextCurrMark !== undefined) {
        factory.push(nextCurrMark, ...currMarkList.slice(iCurr + 1));
    }
    return factory.list;
}

function rebaseMark(currMark: T.SizedMark, baseMark: T.SizedMark): T.SizedMark {
    if (typeof baseMark === "number") {
        return clone(currMark);
    }
    const baseType = baseMark.type;
    switch (baseType) {
        case "Delete":
        case "MDelete":
            return 0;
        case "Modify":
            return clone(currMark);
        default: fail("Not implemented");
    }
}
