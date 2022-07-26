/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ProgressiveEditBuilder } from "../../change-family";
import { Transposed as T } from "../../changeset";
import { ITreeCursor } from "../../forest";
import { AnchorSet, UpPath, Value, Delta, getDepth } from "../../tree";
import { fail } from "../../util";
import { jsonableTreeFromCursor } from "../treeTextCursor";
import { sequenceChangeFamily } from "./sequenceChangeFamily";
import { SequenceChangeset } from "./sequenceChangeset";

export class SequenceEditBuilder extends ProgressiveEditBuilder<SequenceChangeset> {
    private opId: number = 0;

    constructor(
        deltaReceiver: (delta: Delta.Root) => void,
        anchorSet: AnchorSet,
    ) {
        super(sequenceChangeFamily, deltaReceiver, anchorSet);
    }

    public setValue(node: NodePath, value: Value) {
        const modify: T.Modify = { type: "Modify", value: { type: "Set", value } };
        this.applyMarkAtPath(modify, node);
    }

    public insert(place: PlacePath, cursor: ITreeCursor) {
        const id = this.opId++;
        const content = jsonableTreeFromCursor(cursor);
        const insert: T.Insert = { type: "Insert", id, content: [content] };
        this.applyMarkAtPath([insert], place);
    }

    public delete(place: PlacePath, count: number) {
        const id = this.opId++;
        const mark: T.Detach = { type: "Delete", id, count };
        this.applyMarkAtPath(mark, place);
    }

    public move(source: PlacePath, count: number, destination: PlacePath) {
        const id = this.opId++;
        const moveOut: T.Detach = { type: "MoveOut", id, count };
        const moveIn: T.AttachGroup = [{ type: "MoveIn", id, count }];
        if (source.parent() === destination.parent()) {
            const srcIndex = source.parentIndex();
            const dstIndex = destination.parentIndex();
            if (source.parentField() === destination.parentField()) {
                let marks;
                if (dstIndex <= srcIndex) {
                    const gap = srcIndex - dstIndex;
                    if (dstIndex === 0) {
                        if (gap === 0) {
                            marks = [moveIn, moveOut];
                        } else {
                            marks = [moveIn, gap, moveOut];
                        }
                    } else {
                        if (gap === 0) {
                            marks = [moveIn, moveOut];
                        } else {
                            marks = [dstIndex, moveIn, gap, moveOut];
                        }
                    }
                } else {
                    const gap = dstIndex - srcIndex;
                    if (gap < count) {
                        // The target attach point lies within the range of nodes being detached
                        fail("Not implemented");
                    } else {
                        const updatedGap = gap - count;
                        if (srcIndex === 0) {
                            if (updatedGap === 0) {
                                marks = [moveOut, moveIn];
                            } else {
                                marks = [moveOut, updatedGap, moveIn];
                            }
                        } else {
                            if (updatedGap === 0) {
                                marks = [srcIndex, moveOut, moveIn];
                            } else {
                                marks = [srcIndex, moveOut, updatedGap, moveIn];
                            }
                        }
                    }
                }
                this.applyFieldMarksAtPath({ [source.parentField() as string]: marks }, source.parent());
            } else {
                this.applyFieldMarksAtPath(
                    {
                        [source.parentField() as string]: srcIndex > 0 ? [srcIndex, moveOut] : [moveOut],
                        [destination.parentField() as string]: dstIndex > 0 ? [dstIndex, moveIn] : [moveIn],
                    },
                    source.parent(),
                );
            }
        } else {
            // The source and destination are under different parent nodes
            let a: NestBranch = {
                marks: toFieldMarks(moveOut, source),
                path: source.parent(),
            };
            let b: NestBranch = {
                marks: toFieldMarks(moveIn, destination),
                path: destination.parent(),
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
            while (a.path?.parent() !== b.path?.parent()) {
                a = wrapN(a.marks, a.path, 1);
                b = wrapN(b.marks, b.path, 1);
            }
            if (a.path === undefined) {
                this.applyChange({ marks: { ...a.marks, ...b.marks } });
            } else {
                const aPath = a.path;
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const bPath = b.path!;
                const keyA = aPath.parentField() as string;
                const keyB = bPath.parentField() as string;
                let indexA = aPath.parentIndex();
                let indexB = bPath.parentIndex();
                const aMarks = wrap1(a.marks, aPath);
                const bMarks = wrap1(b.marks, bPath);
                if (keyA !== keyB) {
                    this.applyFieldMarksAtPath({ ...aMarks, ...bMarks }, aPath.parent());
                } else {
                    if (indexA === indexB) {
                        fail(ERR_UP_PATH_NOT_VALID);
                    }
                    if (indexA > indexB) {
                        [a, indexA, b, indexB] = [b, indexB, a, indexA];
                    }
                    const gap = indexB - indexA - 1;
                    let marks;
                    if (indexA === 0) {
                        if (gap === 0) {
                            marks = [aMarks[keyA][0], bMarks[keyB][1]];
                        } else {
                            marks = [aMarks[keyA][0], gap, bMarks[keyB][1]];
                        }
                    } else {
                        if (gap === 0) {
                            marks = [indexA, aMarks[keyA][1], bMarks[keyB][1]];
                        } else {
                            marks = [indexA, aMarks[keyA][1], gap, bMarks[keyB][1]];
                        }
                    }
                    this.applyFieldMarksAtPath({ [keyA]: marks }, aPath.parent());
                }
            }
        }
    }

    private applyMarkAtPath(mark: T.Mark, path: UpPath) {
        this.applyFieldMarksAtPath(toFieldMarks(mark, path), path.parent());
    }

    private applyFieldMarksAtPath(marks: T.FieldMarks, path: UpPath | undefined) {
        this.applyChange({ marks: wrap(marks, path) });
    }
}

interface NestBranch {
    marks: T.FieldMarks;
    path: UpPath | undefined;
}

function toFieldMarks(mark: T.Mark, node: UpPath): T.FieldMarks {
    const key = node.parentField();
    const index = node.parentIndex();
    return {
        [key as string]: index === 0 ? [mark] : [index, mark],
    };
}

function wrapN(mark: T.FieldMarks, node: UpPath | undefined, depth: number) {
    let currentNode: UpPath | undefined = node;
    let out: T.FieldMarks = mark;
    let currentDepth = 0;
    while (currentNode !== undefined && currentDepth < depth) {
        out = wrap1(out, currentNode);
        currentDepth += 1;
        currentNode = currentNode.parent();
    }
    return { marks: out, path: currentNode };
}

function wrap(mark: T.FieldMarks, node: UpPath | undefined): T.FieldMarks {
    let currentNode: UpPath | undefined = node;
    let out: T.FieldMarks = mark;
    while (currentNode !== undefined) {
        out = wrap1(out, currentNode);
        currentNode = currentNode.parent();
    }
    return out;
}

function wrap1(marks: T.FieldMarks, node: UpPath | undefined): T.FieldMarks {
    if (node !== undefined) {
        return toFieldMarks({ type: "Modify", fields: marks }, node);
    }
    return marks;
}

type NodePath = UpPath;
type PlacePath = UpPath;

const ERR_UP_PATH_NOT_VALID
    = "If the two paths have the same key and the same index then they should have shared an UpPath earlier";
