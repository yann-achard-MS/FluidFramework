/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { brand, fail } from "../util";
import { FieldKey, Value } from "../tree";
import { Delta, ProtoNode, Transposed as T } from ".";

export function toDelta(change: T.Changeset): Delta.Root {
    return toPositionedMarks<Delta.OuterMark>(change.marks);
}

function toPositionedMarks<TMarks>(marks: T.PositionedMarks): Delta.PositionedMarks<TMarks> {
    const out: Delta.PositionedMarks<Delta.Mark> = [];
    for (const { offset, mark } of marks) {
        if (Array.isArray(mark)) {
            for (const attach of mark) {
                // Inline into `switch(attach.type)` once we upgrade to TS 4.7
                const type = attach.type;
                switch (type) {
                    case "Insert": {
                        const insertMark: Delta.Insert = {
                            type: Delta.MarkType.Insert,
                            content: cloneContent(attach.content),
                        };
                        out.push({ offset, mark: insertMark });
                        break;
                    }
                    case "MInsert": {
                        const insertMark: Delta.InsertAndModify = {
                            type: Delta.MarkType.InsertAndModify,
                            ...cloneModifiedContent(attach),
                        };
                        out.push({ offset, mark: insertMark });
                        break;
                    }
                    case "Move": break;
                    case "Bounce":
                    case "Intake":
                        fail("Not implemented");
                        break;
                    default: unreachableCase(type);
                }
            }
        } else {
            // Inline into `switch(mark.type)` once we upgrade to TS 4.7
            const type = mark.type;
            switch (type) {
                case "Modify": {
                    if (mark.tomb !== undefined) {
                        out.push({
                            offset,
                            mark: {
                                type: Delta.MarkType.Modify,
                                ...convertModify<Delta.OuterMark>(mark),
                            },
                        });
                    }
                    break;
                }
                case "Delete": {
                    if ("count" in mark) {
                        const deleteMark: Delta.Delete = {
                            type: Delta.MarkType.Delete,
                            count: mark.count,
                        };
                        out.push({ offset, mark: deleteMark });
                    } else {
                        const fields = convertModify<Delta.ModifyDeleted | Delta.MoveOut>(mark).fields;
                        if (fields !== undefined) {
                            const deleteMark: Delta.ModifyAndDelete = {
                                type: Delta.MarkType.ModifyAndDelete,
                                fields,
                            };
                            out.push({ offset, mark: deleteMark });
                        } else {
                            const deleteMark: Delta.Delete = {
                                type: Delta.MarkType.Delete,
                                count: 1,
                            };
                            out.push({ offset, mark: deleteMark });
                        }
                    }
                    break;
                }
                case "Move":
                case "Revive":
                case "Return":
                    fail("Not implemented");
                case "Tomb": {
                    // These tombs are only used to precisely describe the location of other attaches.
                    // They have no impact on the current state.
                    break;
                }
                default: unreachableCase(type);
            }
        }
    }
    // TODO: add runtime checks
    return out as unknown as Delta.PositionedMarks<TMarks>;
}

function cloneContent(content: ProtoNode[]): Delta.ProtoNode[] {
    const out: Delta.ProtoNode[] = [];
    for (const node of content) {
        const outNode: Delta.ProtoNode = {
            id: node.id,
            value: node.value,
        };
        if (node.fields !== undefined) {
            const fields: Delta.FieldMap<Delta.ProtoField> = new Map();
            for (const key of Object.keys(node.fields)) {
                fields.set(brand<FieldKey>(key), cloneContent(node.fields[key]));
            }
            if (fields.size > 0) {
                outNode.fields = fields;
            }
        }
        out.push(outNode);
    }
    return out;
}

function cloneModifiedContent(insert: T.ModifyInsert): Pick<Delta.InsertAndModify, "content" | "fields"> {
    // TODO: consider processing modifications at the same time as cloning to avoid unnecessary cloning
    const outNode = cloneContent([insert.content])[0];
    return applyOrCollectModifications(outNode, insert);
}

function applyOrCollectModifications(
    node: Delta.ProtoNode,
    modify: Pick<T.Modify, "value" | "fields">,
): Pick<Delta.InsertAndModify, "content" | "fields"> {
    const outFields: Delta.FieldMarks<Delta.ModifyInserted | Delta.MoveIn | Delta.MoveInAndModify> = new Map();
    if ("value" in modify) {
        node.value = modify.value;
    }
    if (modify.fields !== undefined) {
        const fields = modify.fields;
        for (const key of Object.keys(fields)) {
            const brandedKey = brand<FieldKey>(key);
            const outNodes = node.fields?.get(brandedKey) ?? fail(MOD_ON_MISSING_FIELD);
            const outMarks: Delta.PositionedMarks<Delta.ModifyInserted | Delta.MoveIn | Delta.MoveInAndModify> = [];
            let index = 0;
            let offset = 0;
            for (const markWithOffset of fields[key]) {
                index += markWithOffset.offset;
                offset += markWithOffset.offset;
                const mark = markWithOffset.mark;
                if (Array.isArray(mark)) {
                    for (const attach of mark) {
                        // Inline into `switch(attach.type)` once we upgrade to TS 4.7
                        const type = attach.type;
                        switch (type) {
                            case "Insert": {
                                const content = cloneContent(attach.content);
                                outNodes.splice(index, 0, ...content);
                                index += content.length;
                                offset += content.length;
                                break;
                            }
                            case "MInsert": {
                                const cloned = cloneModifiedContent(attach);
                                if (cloned.fields.size > 0) {
                                    outMarks.push({
                                        offset,
                                        mark: {
                                            type: Delta.MarkType.Modify,
                                            fields: cloned.fields,
                                        },
                                    });
                                    offset = 0;
                                }
                                outNodes.splice(index, 0, cloned.content);
                                index += 1;
                                break;
                            }
                            case "Move":
                            case "Bounce":
                            case "Intake":
                                fail("Not implemented");
                            default: unreachableCase(type);
                        }
                    }
                } else {
                    // Inline into `switch(mark.type)` once we upgrade to TS 4.7
                    const type = mark.type;
                    switch (type) {
                        case "Modify": {
                            if ("tomb" in mark) {
                                continue;
                            }
                            const cloned = applyOrCollectModifications(outNodes[index], mark);
                            if (cloned.fields.size > 0) {
                                outMarks.push({
                                    offset,
                                    mark: {
                                        type: Delta.MarkType.Modify,
                                        fields: cloned.fields,
                                    },
                                });
                                offset = 0;
                            }
                            index += 1;
                            break;
                        }
                        case "Delete": {
                            if ("tomb" in mark) {
                                continue;
                            }
                            if ("count" in mark) {
                                outNodes.splice(index, mark.count);
                            } else {
                                // TODO: convert move-out of inserted content into insert at the destination
                                fail("Not implemented");
                            }
                            break;
                        }
                        case "Tomb": {
                            fail(TOMB_IN_INSERT);
                        }
                        case "Move":
                        case "Revive":
                        case "Return":
                            fail("Not implemented");
                        default: unreachableCase(type);
                    }
                }
            }
            if (outMarks.length > 0) {
                outFields.set(brandedKey, outMarks);
            }
        }
    }
    return { content: node, fields: outFields };
}

const TOMB_IN_INSERT = "Encountered a concurrent deletion in inserted content";
const MOD_ON_MISSING_FIELD = "Encountered a modification that targets a non-existent field on an inserted tree";

interface ModifyLike {
    value?: T.ValueMark;
    fields?: T.FieldMarks;
}

interface DeltaModifyLike<TMark> {
    fields?: Delta.FieldMarks<TMark>;
    setValue?: Value;
}

function convertModify<TMarks>(mark: ModifyLike): DeltaModifyLike<TMarks> {
    const out: DeltaModifyLike<TMarks> = {};
    if ("value" in mark) {
        out.setValue = mark.value;
    }
    const fields = mark.fields;
    if (fields !== undefined) {
        const outFields: Delta.FieldMarks<TMarks> = new Map();
        for (const key of Object.keys(fields)) {
            const marks = toPositionedMarks<TMarks>(fields[key]);
            const brandedKey = brand<FieldKey>(key);
            outFields.set(brandedKey, marks);
        }
        out.fields = outFields;
    }
    return out;
}
