/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionTag } from "../rebase";
import { Value, Delta, UpPath, FieldKey } from "../tree";

/**
 * Characterizes the regions of a document tree that an edit destroys.
 * Passed to a `RepairDataStore`
 */
export interface TreeDestruction {
    revision: RevisionTag;
    /**
     * Currently using Delta to represent destructive edits.
     * TODO: use the subset of Delta that only includes destructive edits or use a totally separate format.
     */
    changes: Delta.Root;
}

/**
 * Represents the change made to a document.
 */
export interface ReadonlyRepairDataStore<TTree = Delta.ProtoNode> {
    getNodes(
        revision: RevisionTag,
        path: UpPath | undefined,
        field: FieldKey,
        index: number,
        count: number,
    ): TTree[];
    getValue(revision: RevisionTag, path: UpPath): Value;
}

export interface RepairDataStore<TTree = Delta.ProtoNode> extends ReadonlyRepairDataStore<TTree> {
    capture(destruction: TreeDestruction): void;
}
