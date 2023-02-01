/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKindIdentifier, Delta, FieldKey, Value, TaggedChange, RevisionTag } from "../../core";
import { Brand, Invariant, JsonCompatibleReadOnly } from "../../util";
import { ChildIndex } from "../deltaUtils";
import { FieldAnchorSet } from "./fieldKind";

/**
 * Functionality provided by a field kind which will be composed with other `FieldChangeHandler`s to
 * implement a unified ChangeFamily supporting documents with multiple field kinds.
 */
export interface FieldChangeHandler<
    TChangeset,
    TNodeKey extends FieldNodeKey = FieldNodeKey,
    TEditor = unknown,
> {
    _typeCheck?: Invariant<TChangeset>;
    rebaser: FieldChangeRebaser<TChangeset>;
    encoder: FieldChangeEncoder<TChangeset, TNodeKey>;
    editor: TEditor;
    /**
     * Should return a negative integer if `lhs < rhs`, zero if `lhs === rhs`, a positive integer if `lhs > rhs`.
     */
    // readonly keyCmp: (lhs: TNodeKey, rhs: TNodeKey) => number;
    // getKeyChanges(change: TChangeset): KeyChanges<TNodeKeyRange>;
    // isKeyInSpan(key: TNodeKey, span: TNodeKeyRange): boolean;
    rebaseKey(key: TNodeKey, over: TChangeset): TNodeKey | undefined;
    prebaseKey(key: TNodeKey, over: TChangeset): TNodeKey | undefined;
    keyToDeltaKey(key: TNodeKey): ChildIndex | undefined;
    intoDelta(change: TChangeset, reviver: NodeReviver): Delta.MarkList;
}

export interface KeyChanges<TNodeKeyRange> {
    readonly dropped: readonly TNodeKeyRange[];
    readonly added: readonly TNodeKeyRange[];
}

export interface FieldChangeRebaser<TChangeset> {
    /**
     * Compose a collection of changesets into a single one.
     */
    compose(changes: TaggedChange<TChangeset>[], genId: IdAllocator): TChangeset;

    /**
     * @returns the inverse of `changes`.
     * See {@link ChangeRebaser} for details.
     */
    invert(change: TaggedChange<TChangeset>, genId: IdAllocator): TChangeset;

    /**
     * Rebase `change` over `over`.
     * See {@link ChangeRebaser} for details.
     */
    rebase(change: TChangeset, over: TaggedChange<TChangeset>, genId: IdAllocator): TChangeset;
}

/**
 * Helper for creating a {@link FieldChangeRebaser} which does not need access to revision tags.
 * This should only be used for fields where the child nodes cannot be edited.
 */
export function referenceFreeFieldChangeRebaser<TChangeset>(data: {
    compose: (changes: TChangeset[]) => TChangeset;
    invert: (change: TChangeset) => TChangeset;
    rebase: (change: TChangeset, over: TChangeset) => TChangeset;
}): FieldChangeRebaser<TChangeset> {
    return {
        compose: (changes, _genId) => data.compose(changes.map((c) => c.change)),
        invert: (change, _genId) => data.invert(change.change),
        rebase: (change, over, _genId) => data.rebase(change, over.change),
    };
}

export interface FieldChangeEncoder<TChangeset, TNodeKey> {
    /**
     * Encodes `change` into a JSON compatible object.
     */
    encodeChangeForJson(formatVersion: number, change: TChangeset): JsonCompatibleReadOnly;

    /**
     * Decodes `change` from a JSON compatible object.
     */
    decodeChangeJson(formatVersion: number, change: JsonCompatibleReadOnly): TChangeset;

    /**
     * Encodes `key` into a JSON compatible object.
     */
    encodeNodeKeyForJson(formatVersion: number, key: TNodeKey): JsonCompatibleReadOnly;

    /**
     * Decodes `key` from a JSON compatible object.
     */
    decodeNodeKeyJson(formatVersion: number, key: JsonCompatibleReadOnly): TNodeKey;
}

/**
 * The `index` represents the index of the child node in the input context.
 * The `index` should be `undefined` iff the child node does not exist in the input context (e.g., an inserted node).
 */
export type ToDelta = (child: NodeChangeset, index: number | undefined) => Delta.Modify;

export type NodeReviver = (
    revision: RevisionTag,
    index: number,
    count: number,
) => Delta.ProtoNode[];

export type IdAllocator = () => ChangesetLocalId;

/**
 * An ID which is unique within a revision of a `ModularChangeset`.
 * A `ModularChangeset` which is a composition of multiple revisions may contain duplicate `ChangesetLocalId`s,
 * but they are unique when qualified by the revision of the change they are used in.
 */
export type ChangesetLocalId = Brand<number, "ChangesetLocalId">;

/**
 * Changeset for a subtree rooted at a specific node.
 */
export interface NodeChangeset {
    fieldChanges?: FieldChangeMap;
    valueChange?: ValueChange;
}

export type ValueChange =
    | {
          /**
           * The revision in which this change occurred.
           * Undefined when it can be inferred from context.
           */
          revision?: RevisionTag;

          /**
           * Can be left unset to represent the value being cleared.
           */
          value?: Value;
      }
    | {
          /**
           * The revision in which this change occurred.
           * Undefined when it can be inferred from context.
           */
          revision?: RevisionTag;

          /**
           * The tag of the change that overwrote the value being restored.
           *
           * Undefined when the operation is the product of a tag-less change being inverted.
           * It is invalid to try convert such an operation to a delta.
           */
          revert: RevisionTag | undefined;
      };

export interface ModularChangeset {
    /**
     * The numerically highest `ChangesetLocalId` used in this changeset.
     * If undefined then this changeset contains no IDs.
     */
    maxId?: ChangesetLocalId;
    changes: FieldChangeMap;
}

export type FieldChangeMap = Map<FieldKey, FieldChange>;

export interface FieldChange {
    fieldKind: FieldKindIdentifier;

    /**
     * If defined, `change` is part of the specified revision.
     * Undefined in the following cases:
     * A) A revision is specified on an ancestor of this `FieldChange`, in which case `change` is part of that revision.
     * B) `change` is composed of multiple revisions.
     * C) `change` is part of an anonymous revision.
     */
    revision?: RevisionTag;
    fieldChanges: FieldChangeset;
    readonly childChanges: FieldAnchorSet<NodeChangeset>;
}

export type FieldChangeset = Brand<unknown, "FieldChangeset">;
export type FieldNodeKey<TValue = number> = Brand<TValue, "FieldNodeKey">;
export type FieldNodeAnchor = Brand<unknown, "FieldNodeAnchor">;
