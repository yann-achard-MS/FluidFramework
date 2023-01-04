/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionTag, TaggedChange } from "../../core";
import { fail } from "../../util";
import { Changeset, Mark, MarkList } from "./format";
import { MarkListFactory } from "./markListFactory";
import { getInputLength, isMuted, isSkipMark } from "./utils";

export type NodeChangeInverter<TNodeChange> = (change: TNodeChange) => TNodeChange;

/**
 * Inverts a given changeset.
 * @param change - The changeset to produce the inverse of.
 * @returns The inverse of the given `change` such that the inverse can be applied after `change`.
 *
 * WARNING! This implementation is incomplete:
 * - Support for slices is not implemented.
 */
export function invert<TNodeChange>(
    change: TaggedChange<Changeset<TNodeChange>>,
    invertChild: NodeChangeInverter<TNodeChange>,
): Changeset<TNodeChange> {
    return invertMarkList(change.change, change.revision, invertChild);
}

function invertMarkList<TNodeChange>(
    markList: MarkList<TNodeChange>,
    revision: RevisionTag | undefined,
    invertChild: NodeChangeInverter<TNodeChange>,
): MarkList<TNodeChange> {
    const inverseMarkList = new MarkListFactory<TNodeChange>();
    let inputIndex = 0;
    for (const mark of markList) {
        const inverseMarks = invertMark(mark, inputIndex, revision, invertChild);
        inverseMarkList.push(...inverseMarks);
        inputIndex += getInputLength(mark);
    }
    return inverseMarkList.list;
}

function invertMark<TNodeChange>(
    mark: Mark<TNodeChange>,
    inputIndex: number,
    revision: RevisionTag | undefined,
    invertChild: NodeChangeInverter<TNodeChange>,
): Mark<TNodeChange>[] {
    if (isSkipMark(mark)) {
        return [mark];
    } else {
        switch (mark.type) {
            case "Insert": {
                return [
                    {
                        type: "Delete",
                        count: mark.type === "Insert" ? mark.content.length : 1,
                    },
                ];
            }
            case "Delete": {
                return [
                    {
                        type: "Revive",
                        detachedBy: mark.revision ?? revision,
                        detachIndex: inputIndex,
                        count: mark.count,
                    },
                ];
            }
            case "Revive": {
                if (!isMuted(mark)) {
                    return [
                        {
                            type: "Delete",
                            count: mark.count,
                        },
                    ];
                }
                if (mark.lastDetachedBy === undefined) {
                    // The nodes were already revived, so the revive mark did not affect them.
                    return mark.changes === undefined
                        ? [mark.count]
                        : invertMark(
                              { type: "Modify", changes: mark.changes },
                              inputIndex,
                              revision,
                              invertChild,
                          );
                }
                // The node were not revived and could not be revived.
                return [];
            }
            case "Modify": {
                return [
                    {
                        type: "Modify",
                        changes: invertChild(mark.changes),
                    },
                ];
            }
            case "MoveOut":
            case "ReturnFrom": {
                if (isMuted(mark)) {
                    // The nodes were already detached so the mark had no effect
                    return [];
                }
                if (mark.isDstMuted) {
                    // The nodes were present but the destination was muted, the mark had no effect on the nodes.
                    return [mark.count];
                }
                return [
                    {
                        type: "ReturnTo",
                        id: mark.id,
                        count: mark.count,
                        detachedBy: mark.revision ?? revision,
                        detachIndex: inputIndex,
                    },
                ];
            }
            case "MoveIn":
            case "ReturnTo": {
                if (!isMuted(mark)) {
                    if (mark.isSrcMuted) {
                        // The node could have been attached but were not because of the source.
                        return [];
                    }
                    return [
                        {
                            type: "ReturnFrom",
                            id: mark.id,
                            count: mark.count,
                            detachedBy: mark.revision ?? revision,
                        },
                    ];
                }
                if (mark.lastDetachedBy === undefined) {
                    // The nodes were already attached, so the mark did not affect them.
                    return [mark.count];
                }
                // The node were not attached and could not be attached.
                return [];
            }
            default:
                fail("Not implemented");
        }
    }
}
