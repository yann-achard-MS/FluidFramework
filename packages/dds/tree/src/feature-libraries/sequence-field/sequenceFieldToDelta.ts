/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { brandOpaque, clone, fail, OffsetListFactory } from "../../util";
import { Delta } from "../../tree";
import { singleTextCursor } from "../treeTextCursor";
import * as F from "./format";
import { isSkipMark } from "./utils";

export type ToDelta<TNodeChange> = (child: TNodeChange) => Delta.Modify;

export function sequenceFieldToDelta<TNodeChange>(
    marks: F.MarkList<TNodeChange>,
    deltaFromChild: ToDelta<TNodeChange>,
): Delta.MarkList {
    const out = new OffsetListFactory<Delta.Mark>();
    for (const mark of marks) {
        if (isSkipMark(mark)) {
            out.pushOffset(mark);
        } else {
            // Inline into `switch(mark.type)` once we upgrade to TS 4.7
            const type = mark.type;
            switch (type) {
                case "Insert": {
                    const insertMark: Delta.Insert = {
                        type: Delta.MarkType.Insert,
                        // TODO: can we skip this clone?
                        content: clone(mark.content).map(singleTextCursor),
                    };
                    out.pushContent(insertMark);
                    break;
                }
                case "MInsert": {
                    const cloned = cloneAndModify(mark, deltaFromChild);
                    if (cloned.fields.size > 0) {
                        const insertMark: Delta.InsertAndModify = {
                            type: Delta.MarkType.InsertAndModify,
                            ...cloned,
                        };
                        out.pushContent(insertMark);
                    } else {
                        const insertMark: Delta.Insert = {
                            type: Delta.MarkType.Insert,
                            content: [cloned.content],
                        };
                        out.pushContent(insertMark);
                    }
                    break;
                }
                case "MoveIn": {
                    const moveMark: Delta.MoveIn = {
                        type: Delta.MarkType.MoveIn,
                        moveId: brandOpaque<Delta.MoveId>(mark.id),
                    };
                    out.pushContent(moveMark);
                    break;
                }
                case "MMoveIn":
                    fail(ERR_NOT_IMPLEMENTED);
                case "Modify": {
                    if (mark.tomb === undefined) {
                        const modify = deltaFromChild(mark.changes);
                        if (modify.setValue !== undefined || modify.fields !== undefined) {
                            out.pushContent(modify);
                        } else {
                            out.pushOffset(1);
                        }
                    }
                    break;
                }
                case "Delete": {
                    const deleteMark: Delta.Delete = {
                        type: Delta.MarkType.Delete,
                        count: mark.count,
                    };
                    out.pushContent(deleteMark);
                    break;
                }
                case "MDelete": {
                    const modify = deltaFromChild(mark.changes);
                    if (modify.fields !== undefined) {
                        const deleteMark: Delta.ModifyAndDelete = {
                            type: Delta.MarkType.ModifyAndDelete,
                            fields: modify.fields,
                        };
                        out.pushContent(deleteMark);
                    } else {
                        const deleteMark: Delta.Delete = {
                            type: Delta.MarkType.Delete,
                            count: 1,
                        };
                        out.pushContent(deleteMark);
                    }
                    break;
                }
                case "MoveOut": {
                    const moveMark: Delta.MoveOut = {
                        type: Delta.MarkType.MoveOut,
                        moveId: brandOpaque<Delta.MoveId>(mark.id),
                        count: mark.count,
                    };
                    out.pushContent(moveMark);
                    break;
                }
                case "MMoveOut":
                case "Revive":
                case "MRevive":
                case "Return":
                case "MReturn":
                    fail(ERR_NOT_IMPLEMENTED);
                case "Tomb": {
                    // These tombs are only used to precisely describe the location of other attaches.
                    // They have no impact on the current state.
                    break;
                }
                default: unreachableCase(type);
            }
        }
    }
    return out.list;
}

/**
 * Converts inserted content into the format expected in Delta instances.
 * This involves applying all except MoveIn changes.
 *
 * The returned `fields` map may be empty if all modifications are applied by the function.
 */
function cloneAndModify<TNodeChange>(
    insert: F.ModifyInsert<TNodeChange>,
    deltaFromChild: ToDelta<TNodeChange>,
): DeltaInsertModification {
    // TODO: consider processing modifications at the same time as cloning to avoid unnecessary cloning
    const outNode = clone(insert.content);
    const outModifications = Delta.applyModifyToInsert(outNode, deltaFromChild(insert.changes));
    return { content: singleTextCursor(outNode), fields: outModifications };
}

/**
 * Modifications to be applied to an inserted tree in a Delta.
 */
interface DeltaInsertModification {
    /**
     * The subtree to be inserted.
     */
    content: Delta.ProtoNode;
    /**
     * The modifications to make to the inserted subtree.
     * May be empty.
     */
    fields: Delta.FieldMarks;
}

const ERR_NOT_IMPLEMENTED = "Not implemented";
