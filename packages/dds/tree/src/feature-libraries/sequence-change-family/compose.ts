/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    getMarkLength,
    isAttachGroup,
    isDetachMark,
    OpRangeMap,
    splitMark,
    Transposed as T,
} from "../../changeset";
import { clone, fail, mapObject } from "../../util";
import { SequenceChangeset } from "./sequenceChangeset";

interface Closure {
    opIdOffset: number;
    opIdVisitor: (_: number) => void;
    baseMap: OpRangeMap;
}

export function compose(...changes: SequenceChangeset[]): SequenceChangeset {
    const opRanges: T.OpRange[] = [];
    const base: SequenceChangeset = {
        opRanges,
        marks: {},
    };
    if (changes.length > 0) {
        let opIdOffset = 0;
        for (const change of changes) {
            let maxOpId = -Infinity;
            let minOpId = Infinity;
            const baseMap = new OpRangeMap(base.opRanges ?? fail("missing op ranges"));
            const opIdVisitor = (id: number) => {
                maxOpId = Math.max(maxOpId, id);
                minOpId = Math.min(minOpId, id);
            };
            const closure: Closure = {
                opIdOffset,
                opIdVisitor,
                baseMap,
            };
            foldInFieldMarks(closure, change.marks, base.marks);
            // If any IDs are were encountered
            if (isFinite(maxOpId)) {
                const offset = maxOpId - minOpId;
                for (const currRange of change.opRanges ?? []) {
                    const newRange: T.OpRange = {
                        tag: currRange.tag,
                        min: currRange.min + opIdOffset,
                        offset: (currRange.offset ?? 0) + opIdOffset - minOpId,
                    };
                    if (newRange.offset === 0) {
                        delete newRange.offset;
                    }
                    opRanges.push(newRange);
                }
                // The `Math.max(1, offset)` is needed to ensure that we allocate an ID
                // for the range even if the only encountered ID was 0.
                opIdOffset += Math.max(1, offset);
            }
        }
    }
    return base;
}

function foldInFieldMarks(closure: Closure, newFieldMarks: T.FieldMarks, baseFieldMarks: T.FieldMarks) {
    for (const key of Object.keys(newFieldMarks)) {
        const newMarkList = newFieldMarks[key];
        baseFieldMarks[key] ??= [];
        foldInMarkList(closure, newMarkList, baseFieldMarks[key]);
    }
}

function foldInMarkList(
    closure: Closure,
    newMarkList: T.MarkList<T.Mark>,
    baseMarkList: T.MarkList<T.Mark>,
): void {
    let iTotal = 0;
    let iIn = 0;
    let nextNewMark: T.Mark | undefined = newMarkList[iIn];
    while (nextNewMark !== undefined) {
        let newMark: T.Mark = nextNewMark;
        nextNewMark = undefined;
        let baseMark = baseMarkList[iTotal];
        if (baseMark === undefined) {
            baseMarkList.push(cloneMark(closure, newMark));
        } else if (isAttachGroup(newMark)) {
            baseMarkList.splice(iTotal, 0, cloneAttachGroup(closure, newMark));
        } else if (isDetachMark(baseMark)) {
            // TODO: match base detaches to tombs and reattach in the newMarkList
            nextNewMark = newMark;
        } else {
            const newMarkLength = getMarkLength(newMark);
            const baseMarkLength = getMarkLength(baseMark);
            if (newMarkLength < baseMarkLength) {
                const totalMarkPair = splitMark(baseMark, newMarkLength);
                baseMark = totalMarkPair[0];
                baseMarkList.splice(iTotal, 1, ...totalMarkPair);
            } else if (newMarkLength > baseMarkLength) {
                [newMark, nextNewMark] = splitMark(newMark, baseMarkLength);
            }
            // Passed this point, we are guaranteed that mark and total mark have the same length
            if (typeof baseMark === "number") {
                // TODO: insert new tombs and reattaches without replacing the offset
                baseMarkList.splice(iTotal, 1, newMark);
            } else {
                const composedMark = composeMarks(closure, newMark, baseMark);
                baseMarkList.splice(iTotal, 1, ...composedMark);
            }
        }
        if (nextNewMark === undefined) {
            iIn += 1;
            nextNewMark = newMarkList[iIn];
        }
        iTotal += 1;
    }
}

function composeMarks(
    closure: Closure,
    newMark: T.SizedMark,
    baseMark: T.ObjectMark | T.AttachGroup,
): T.Mark[] {
    if (typeof newMark === "number") {
        return [baseMark];
    }
    const newType = newMark.type;
    if (isAttachGroup(baseMark)) {
        switch (newType) {
            case "Modify": {
                const attach = baseMark[0];
                if (attach.type === "Insert") {
                    return [[{
                        ...newMark,
                        type: "MInsert",
                        id: attach.id + closure.opIdOffset,
                        content: attach.content[0],
                    }]];
                } else if (attach.type === "MInsert") {
                    updateModifyLike(closure, newMark, attach);
                    return [[attach]];
                }
                fail("Not implemented");
            }
            case "Delete": {
                // The insertion of the previous change is subsequently deleted.
                // TODO: preserve the insertion as muted
                return [];
            }
            default: fail("Not implemented");
        }
    }
    const baseType = baseMark.type;
    if (newType === "MDelete" || baseType === "MDelete") {
        // This should not occur yet because we discard all modifications to deleted subtrees
        // In the long run we want to preserve them.
        fail("TODO: support modifications to deleted subtree");
    }
    switch (baseType) {
        case "Modify": {
            switch (newType) {
                case "Modify": {
                    updateModifyLike(closure, newMark, baseMark);
                    return [baseMark];
                }
                case "Delete": {
                    // For now the deletion obliterates all other modifications.
                    // In the long run we want to preserve them.
                    return [{
                        type: "Delete",
                        id: newMark.id + closure.opIdOffset,
                        count: newMark.count,
                    }];
                }
                default: fail("Not implemented");
            }
        }
        default: fail("Not implemented");
    }
}
function updateModifyLike(closure: Closure, curr: T.Modify, base: T.ModifyInsert | T.Modify) {
    if (curr.fields !== undefined) {
        if (base.fields === undefined) {
            base.fields = {};
        }
        foldInFieldMarks(closure, curr.fields, base.fields);
    }
    if (curr.value !== undefined) {
        const valueMark = curr.value;
        closure.opIdVisitor(valueMark.id);
        // Later values override earlier ones
        base.value = {
            id: valueMark.id + closure.opIdOffset,
            value: valueMark.value,
        };
    }
}

function cloneMark(closure: Closure, mark: T.Mark): T.Mark {
    if (isAttachGroup(mark)) {
        return cloneAttachGroup(closure, mark);
    }
    if (typeof mark === "number") {
        return mark;
    }
    // TODO: avoid cloning parts of the object that are replaced afterward
    const clonedMark = clone(mark);
    if ("id" in clonedMark) {
        closure.opIdVisitor(clonedMark.id);
        clonedMark.id += closure.opIdOffset;
    }
    if ("value" in clonedMark && clonedMark.value !== undefined) {
        const valueMark = clonedMark.value;
        closure.opIdVisitor(valueMark.id);
        clonedMark.value = {
            id: valueMark.id + closure.opIdOffset,
            value: valueMark.value,
        };
    }
    if ("fields" in clonedMark && clonedMark.fields !== undefined) {
        clonedMark.fields = mapObject(clonedMark.fields, (v) => v.map((m) => cloneMark(closure, m)));
    }
    return clonedMark;
}

function cloneAttachGroup(closure: Closure, group: T.AttachGroup): T.AttachGroup {
    return group.map((attach: T.Attach): T.Attach => {
        // TODO: avoid cloning parts of the object that are replaced afterward
        const clonedAttach = clone(attach);
        if ("id" in attach) {
            closure.opIdVisitor(clonedAttach.id);
            clonedAttach.id += closure.opIdOffset;
        }
        if ("fields" in clonedAttach && clonedAttach.fields !== undefined) {
            clonedAttach.fields = mapObject(clonedAttach.fields, (v) => v.map((m) => cloneMark(closure, m)));
        }
        return clonedAttach;
    });
}
