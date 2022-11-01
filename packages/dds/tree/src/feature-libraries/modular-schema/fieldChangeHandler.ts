/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKindIdentifier, Delta, FieldKey, Value, TaggedChange, RevisionTag } from "../../core";
import { Brand, Invariant, JsonCompatibleReadOnly } from "../../util";

/**
 * Functionality provided by a field kind which will be composed with other `FieldChangeHandler`s to
 * implement a unified ChangeFamily supporting documents with multiple field kinds.
 */
export interface FieldChangeHandler<
    TChangeset,
    TEditor extends FieldEditor<TChangeset> = FieldEditor<TChangeset>,
> {
    _typeCheck?: Invariant<TChangeset>;
    rebaser: FieldChangeRebaser<TChangeset>;
    encoder: FieldChangeEncoder<TChangeset>;
    editor: TEditor;
    intoDelta(change: TChangeset, deltaFromChild: ToDelta): Delta.MarkList;

    // TODO
    // buildEditor(submitEdit: (change: TChangeset) => void): TEditor;
}

export interface FieldChangeRebaser<TChangeset> {
    /**
     * Compose a collection of changesets into a single one.
     * See {@link ChangeRebaser} for details.
     */
    compose(changes: TChangeset[], composeChild: NodeRebaser): TChangeset;

    /**
     * @returns the inverse of `changes`.
     * See {@link ChangeRebaser} for details.
     */
    invert(change: TaggedChange<TChangeset>, invertChild: NodeRebaser): TChangeset;

    /**
     * Rebase `change` over `over`.
     * See {@link ChangeRebaser} for details.
     */
    rebase(
        change: TChangeset,
        base: TaggedChange<TChangeset>,
        rebaseChild: NodeRebaser,
    ): TChangeset;

    /**
     * Unbase `change` from `over`.
     * See {@link ChangeRebaser} for details.
     */
    unbase(
        change: TChangeset,
        base: TaggedChange<TChangeset>,
        rebaseChild: NodeRebaser,
    ): TChangeset;
}

/**
 * Helper for creating a {@link FieldChangeRebaser} which does not need access to revision tags
 */
export function referenceFreeFieldChangeRebaser<TChangeset>(data: {
    compose: (changes: TChangeset[], nodeRebaser: ReferenceFreeNodeRebaser) => TChangeset;
    invert: (change: TChangeset, nodeRebaser: ReferenceFreeNodeRebaser) => TChangeset;
    rebase: (
        change: TChangeset,
        over: TChangeset,
        nodeRebaser: ReferenceFreeNodeRebaser,
    ) => TChangeset;
}): FieldChangeRebaser<TChangeset> {
    return {
        compose: data.compose,
        invert: (change, nodeRebaser) =>
            data.invert(change.change, refFreeNodeRebaser(nodeRebaser, change.revision)),
        rebase: (change, base, nodeRebaser) =>
            data.rebase(change, base.change, refFreeNodeRebaser(nodeRebaser, base.revision)),
        unbase: (change, base, nodeRebaser) => {
            const inverse = data.invert(
                base.change,
                refFreeNodeRebaser(nodeRebaser, base.revision),
            );
            const unbased = data.rebase(
                change,
                inverse,
                refFreeNodeRebaser(nodeRebaser, inverse.revision),
            );
            return unbased;
        },
    };
}

function refFreeNodeRebaser(
    nodeRebaser: NodeRebaser,
    revision: RevisionTag | undefined,
): ReferenceFreeNodeRebaser {
    return {
        rebase: (change: NodeChangeset, base: NodeChangeset) =>
            nodeRebaser.rebase(change, { revision, change: base }),
        unbase: (change: NodeChangeset, base: NodeChangeset) =>
            nodeRebaser.unbase(change, { revision, change: base }),
        invert: (change: NodeChangeset) => nodeRebaser.invert({ revision, change }),
        compose: (changes: NodeChangeset[]) => nodeRebaser.compose(changes),
    };
}

export interface ReferenceFreeNodeRebaser {
    rebase(change: NodeChangeset, base: NodeChangeset): NodeChangeset;
    unbase(change: NodeChangeset, base: NodeChangeset): NodeChangeset;
    invert(change: NodeChangeset): NodeChangeset;
    compose(changes: NodeChangeset[]): NodeChangeset;
}

export interface FieldChangeEncoder<TChangeset> {
    /**
     * Encodes `change` into a JSON compatible object.
     */
    encodeForJson(
        formatVersion: number,
        change: TChangeset,
        encodeChild: NodeChangeEncoder,
    ): JsonCompatibleReadOnly;

    /**
     * Decodes `change` from a JSON compatible object.
     */
    decodeJson(
        formatVersion: number,
        change: JsonCompatibleReadOnly,
        decodeChild: NodeChangeDecoder,
    ): TChangeset;
}

export interface FieldEditor<TChangeset> {
    /**
     * Creates a changeset which represents the given `change` to the child at `childIndex` of this editor's field.
     */
    buildChildChange(childIndex: number, change: NodeChangeset): TChangeset;
}

export type ToDelta = (child: NodeChangeset) => Delta.Modify;

export interface NodeRebaser {
    rebase(change: NodeChangeset, base: TaggedChange<NodeChangeset>): NodeChangeset;
    unbase(change: NodeChangeset, base: TaggedChange<NodeChangeset>): NodeChangeset;
    invert(change: TaggedChange<NodeChangeset>): NodeChangeset;
    compose(changes: NodeChangeset[]): NodeChangeset;
}

export type NodeChangeEncoder = (change: NodeChangeset) => JsonCompatibleReadOnly;
export type NodeChangeDecoder = (change: JsonCompatibleReadOnly) => NodeChangeset;

/**
 * Changeset for a subtree rooted at a specific node.
 */
export interface NodeChangeset {
    fieldChanges?: FieldChangeMap;
    valueChange?: ValueChange;
}

export interface ValueChange {
    /**
     * Can be left unset to represent the value being cleared.
     */
    value?: Value;
}

export type FieldChangeMap = Map<FieldKey, FieldChange>;

export interface FieldChange {
    fieldKind: FieldKindIdentifier;
    change: FieldChangeset;
}

export type FieldChangeset = Brand<unknown, "FieldChangeset">;
