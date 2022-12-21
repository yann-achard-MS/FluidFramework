/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { jsonableTreeFromCursor } from "../treeTextCursor";
import { ITreeCursor, RevisionTag } from "../../core";
import { FieldEditor } from "../modular-schema";
import { Changeset, Mark, NodeChangeType, Reattach } from "./format";

export interface SequenceFieldEditor extends FieldEditor<Changeset> {
    insert(index: number, cursor: ITreeCursor | ITreeCursor[]): Changeset<never>;
    delete(index: number, count: number): Changeset<never>;
    revive(
        index: number,
        count: number,
        detachedBy: RevisionTag,
        detachIndex: number,
        isIntention?: true,
    ): Changeset<never>;
}

export const sequenceFieldEditor = {
    buildChildChange: <TNodeChange = NodeChangeType>(
        index: number,
        change: TNodeChange,
    ): Changeset<TNodeChange> => markAtIndex(index, { type: "Modify", changes: change }),
    insert: (index: number, cursors: ITreeCursor | ITreeCursor[]): Changeset<never> =>
        markAtIndex(index, {
            type: "Insert",
            content: Array.isArray(cursors)
                ? cursors.map(jsonableTreeFromCursor)
                : [jsonableTreeFromCursor(cursors)],
        }),
    delete: (index: number, count: number): Changeset<never> =>
        count === 0 ? [] : markAtIndex(index, { type: "Delete", count }),
    revive: (
        index: number,
        count: number,
        detachedBy: RevisionTag,
        detachIndex: number,
        isIntention?: true,
    ): Changeset<never> => {
        const mark: Reattach<never> = {
            type: "Revive",
            count,
            detachedBy,
            detachIndex,
        };
        if (isIntention) {
            mark.isIntention = true;
        }
        return count === 0 ? [] : markAtIndex(index, mark);
    },
};

function markAtIndex<TNodeChange>(index: number, mark: Mark<TNodeChange>): Changeset<TNodeChange> {
    return index === 0 ? [mark] : [index, mark];
}
