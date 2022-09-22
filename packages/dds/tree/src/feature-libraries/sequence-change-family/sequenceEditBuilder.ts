/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ProgressiveEditBuilder } from "../../change-family";
import { ITreeCursor } from "../../forest";
import { AnchorSet, UpPath, Value, Delta, getDepth } from "../../tree";
import { fail } from "../../util";
import { jsonableTreeFromCursor } from "../treeTextCursorLegacy";
import { toFieldMarks, Transposed as T, wrap, wrap1, wrapN } from "./changeset";
import { sequenceChangeFamily } from "./sequenceChangeFamily";
import { AbstractChangeset, SequenceChangeset, WireChangeset } from "./sequenceChangeset";

export class SequenceEditBuilder extends ProgressiveEditBuilder<SequenceChangeset, WireChangeset> {
    private opId: number = 0;

    constructor(
        deltaReceiver: (delta: Delta.Root) => void,
        changeConcretizer: (change: WireChangeset) => SequenceChangeset,
        anchorSet: AnchorSet,
    ) {
        super(sequenceChangeFamily, deltaReceiver, changeConcretizer, anchorSet);
    }

    public xForm(target: UpPath, xForm: string): void {
        const change: AbstractChangeset = {
            type: "Abstract",
            path: target,
            op: xForm,
        };
        this.applyChange(change);
    }

    public setValue(node: NodePath, value: Value) {
        const modify: T.Modify & { value: T.SetValue; } = { type: "Modify", value: { id: 0 } };
        // Only set the `SetValue.value` field if the given `value` is defined.
        // This ensures the object properly round-trips through JSON.
        if (value !== undefined) {
            modify.value.value = value;
        }
        this.applyMarkAtPath(modify, node);
    }

    public insert(place: PlacePath, cursor: ITreeCursor) {
        const id = this.opId++;
        const content = jsonableTreeFromCursor(cursor);
        const insert: T.Insert = { type: "Insert", id, content: [content] };
        this.applyMarkAtPath(insert, place);
    }

    public delete(place: PlacePath, count: number) {
        const id = this.opId++;
        const mark: T.Detach = { type: "Delete", id, count };
        this.applyMarkAtPath(mark, place);
    }

    public move(source: PlacePath, count: number, destination: PlacePath) {
        if (count === 0) {
            return;
        }
        const id = this.opId++;
        const moveOut: T.Detach = { type: "MoveOut", id, count };
        const moveIn: T.MoveIn = { type: "MoveIn", id, count };
        if (source.parent === destination.parent) {
            const srcIndex = source.parentIndex;
            const dstIndex = destination.parentIndex;
            if (source.parentField === destination.parentField) {
                const marks: T.MarkList = [];
                if (dstIndex <= srcIndex) {
                    if (dstIndex > 0) {
                        marks.push(dstIndex);
                    }
                    marks.push(moveIn);
                    const gap = srcIndex - dstIndex;
                    if (gap > 0) {
                        marks.push(gap);
                    }
                    marks.push(moveOut);
                } else {
                    if (srcIndex > 0) {
                        marks.push(srcIndex);
                    }
                    const gap = dstIndex - srcIndex;
                    if (gap < count) {
                        // The target attach point lies within the range of nodes being detached.
                        // Split the operation into two moves.
                        const id2 = this.opId++;
                        marks.push(
                            { type: "MoveOut", id, count: gap },
                            { type: "MoveIn", id, count: count - gap },
                            { type: "MoveIn", id: id2, count: gap },
                            { type: "MoveOut", id: id2, count: count - gap },
                        );
                    } else {
                        marks.push(moveOut);
                        const updatedGap = gap - count;
                        if (updatedGap >= 0) {
                            marks.push(updatedGap);
                        }
                        marks.push(moveIn);
                    }
                }
                this.applyFieldMarksAtPath({ [source.parentField as string]: marks }, source.parent);
            } else {
                this.applyFieldMarksAtPath(
                    {
                        [source.parentField as string]: srcIndex > 0 ? [srcIndex, moveOut] : [moveOut],
                        [destination.parentField as string]: dstIndex > 0 ? [dstIndex, moveIn] : [moveIn],
                    },
                    source.parent,
                );
            }
        } else {
            // The source and destination are under different parent nodes
            let a: NestBranch = {
                marks: toFieldMarks(moveOut, source),
                path: source.parent,
            };
            let b: NestBranch = {
                marks: toFieldMarks(moveIn, destination),
                path: destination.parent,
            };
            let depthDiff = getDepth(source) - getDepth(destination);
            // Ensure that a represents the deeper mark
            if (depthDiff < 0) {
                [a, b] = [b, a];
                depthDiff = -depthDiff;
            }
            // Nest the deeper mark so that they are both at the same depth
            a = wrapN(a.marks, a.path, depthDiff);
            // Nest both marks one level at a time until they reach the same parent
            while (a.path?.parent !== b.path?.parent) {
                // The paths are at same depth they must both be defined in order to have different parents
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                a = { marks: wrap1(a.marks, a.path!), path: a.path?.parent };
                // The paths are at same depth they must both be defined in order to have different parents
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                b = { marks: wrap1(b.marks, b.path!), path: b.path?.parent };
            }
            if (a.path === undefined) {
                this.applyChange({ marks: { ...a.marks, ...b.marks } });
            } else {
                const aPath = a.path;
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const bPath = b.path!;
                const keyA = aPath.parentField as string;
                const keyB = bPath.parentField as string;
                const aFieldMarks = wrap1(a.marks, aPath);
                const bFieldMarks = wrap1(b.marks, bPath);
                if (keyA !== keyB) {
                    this.applyFieldMarksAtPath({ ...aFieldMarks, ...bFieldMarks }, aPath.parent);
                } else {
                    let indexA = aPath.parentIndex;
                    let indexB = bPath.parentIndex;
                    if (indexA === indexB) {
                        fail(ERR_UP_PATH_NOT_VALID);
                    }
                    let aMarkList = aFieldMarks[keyA];
                    let bMarkList = bFieldMarks[keyB];
                    if (indexA > indexB) {
                        [aMarkList, indexA, bMarkList, indexB] = [bMarkList, indexB, aMarkList, indexA];
                    }
                    const marks = aMarkList;
                    const gap = indexB - indexA - 1;
                    if (gap > 0) {
                        marks.push(gap);
                    }
                    marks.push(bMarkList[1]);
                    this.applyFieldMarksAtPath({ [keyA]: marks }, aPath.parent);
                }
            }
        }
    }

    private applyMarkAtPath(mark: T.Mark, path: UpPath) {
        this.applyFieldMarksAtPath(toFieldMarks(mark, path), path.parent);
    }

    private applyFieldMarksAtPath(marks: T.FieldMarks, path: UpPath | undefined) {
        this.applyChange({ marks: wrap(marks, path) });
    }
}

interface NestBranch {
    marks: T.FieldMarks;
    path: UpPath | undefined;
}

/**
 * Location of a Node in a tree relative to the root.
 * Only valid for a specific revision of that tree.
 */
export interface NodePath extends UpPath{}

/**
 * Location of a "Place" in a tree relative to the root.
 * This means a location where a node could be inserted, such as between nodes or an end of a field.
 * Only valid for a specific revision of that tree.
 */
export interface PlacePath extends UpPath{}

const ERR_UP_PATH_NOT_VALID
    = "If the two paths have the same key and the same index then they should have shared an UpPath earlier";
