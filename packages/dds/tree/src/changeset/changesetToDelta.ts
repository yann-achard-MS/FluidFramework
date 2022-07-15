/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { fail } from "../util";
import * as Delta from "./delta";
import { Transposed as T } from "./format";
import { contentWithCountPolicy, OffsetListPtr, offsetSumVisitorFactory, unaryContentPolicy } from "./offsetListPtr";

export function changesetToDelta(change: T.Changeset): Delta.Root {
    return fieldMarksToPositionedMarks(change.marks);
}

function fieldMarksToPositionedMarks(marks: T.FieldMarks): Delta.Root {
    const out: Delta.MarkWithOffset<Delta.Mark>[] = [];
    const tombsList = marks.tombs ?? [];
    const nodesList = marks.nodes ?? [];
    const attachList = marks.attach ?? [];
    const modifyList = marks.modify ?? [];
    const valuesList = marks.values ?? [];

    // Process values list
    {
        let offset = 0;
        let tombsPtr = OffsetListPtr.from<T.Tombstones>(tombsList, contentWithCountPolicy);
        for (const valueMark of valuesList) {
            if (typeof valueMark === "number") {
                tombsPtr = tombsPtr.fwd(valueMark);
                offset += valueMark;
            } else {
                const { type } = valueMark;
                switch (type) {
                    case "Set": {
                        const visitor = offsetSumVisitorFactory();
                        tombsPtr = tombsPtr.fwd(1, visitor);
                        // We only set values on nodes that are not representing tombstones
                        if (visitor.sum === 1) {
                            const mark: Delta.Modify = {
                                type: Delta.MarkType.Modify,
                                setValue: valueMark.value,
                                // TODO: add modify entries either here on the fly or in a separate pass over modifyList
                            };
                            out.push({ offset, mark });
                            offset = 0;
                        } else {
                            offset += 1;
                        }
                        break;
                    }
                    case "Revert": fail("Not supported yet");
                    default: unreachableCase(type);
                }
            }
        }
    }
    // Process modify list
    {
        let index = 0;
        let tombsPtr = OffsetListPtr.from<T.Tombstones>(tombsList, contentWithCountPolicy);
        for (const modifyMark of modifyList) {
            if (typeof modifyMark === "number") {
                tombsPtr = tombsPtr.fwd(modifyMark);
                index += modifyMark;
            } else {
                const visitor = offsetSumVisitorFactory();
                tombsPtr = tombsPtr.fwd(1, visitor);
                // We only modify nodes that are not representing tombstones
                if (visitor.sum === 1) {
                    const map: Delta.FieldMarks<Delta.Mark> = new Map();
                    // populate map --------------
                    if (map.size > 0) {
                        const mark: Delta.Modify = {
                            type: Delta.MarkType.Modify,
                            fields: map,
                        };
                        // splice the modify in the map, potentially merging with a set value
                    }
                }
                index += 1;
                break;
            }
        }
    }
    // Process nodes list
    {
        let tombsPtr = OffsetListPtr.from<T.Tombstones>(tombsList, contentWithCountPolicy);
        for (const nodeMark of nodesList) {
            if (typeof nodeMark === "number") {
                tombsPtr = tombsPtr.fwd(nodeMark);
            } else {
                const { type, count } = nodeMark;
                switch (type) {
                    case "Delete": {
                        const visitor = offsetSumVisitorFactory();
                        tombsPtr = tombsPtr.fwd(count, visitor);
                        const mark: Delta.Delete = {
                            type: Delta.MarkType.Delete,
                            // We only delete nodes that are not representing tombstones
                            count: visitor.sum,
                            // TODO: splice modify entries into here
                        };
                        // out.push({ offset, mark }); splice into out
                        break;
                    }
                    case "Move":
                    case "Revive":
                    case "Return": fail("Not supported yet");
                    default: unreachableCase(type);
                }
            }
        }
    }

    return out;
}
