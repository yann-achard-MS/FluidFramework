/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKindIdentifier, Delta, FieldKey, Value, TaggedChange, RevisionTag } from "../../core";
import { Brand, Invariant, JsonCompatibleReadOnly } from "../../util";
import {
	AnchorSetChange,
	anchorSetFromData,
	AnchorSetKey,
	AnchorSetOpsURIs,
	FieldAnchorSetOps,
} from "./anchorSet";
import { FieldKind } from "./fieldKind";

/**
 * Functionality provided by a field kind which will be composed with other `FieldChangeHandler`s to
 * implement a unified ChangeFamily supporting documents with multiple field kinds.
 * @alpha
 */
export interface FieldChangeHandler<
	TOps extends AnchorSetOpsURIs = any,
	TEditor = unknown,
	TChangeset extends AnchorSetChange<TOps> = AnchorSetChange<TOps>,
	TNodeKey extends AnchorSetKey<TOps> = AnchorSetKey<TOps>,
> {
	_typeCheck?: Invariant<TChangeset>;
	rebaser: FieldChangeRebaser<TChangeset>;
	encoder: FieldChangeEncoder<TChangeset>;
	editor: TEditor;
	readonly anchorSetOps: FieldAnchorSetOps<TOps>;
	getKey(index: number): TNodeKey;
	keyToDeltaKey(key: TNodeKey): ChildIndex | undefined;
	intoDelta(change: TChangeset, reviver: NodeReviver): Delta.MarkList;
}

/**
 * @alpha
 */
export interface ChildIndex {
	index: number;
	context: Context;
}

/**
 * @alpha
 */
export enum Context {
	Input,
	Output,
}

// /**
//  * @alpha
//  */
// export interface KeyChanges<TNodeKeyRange> {
// 	readonly dropped: readonly TNodeKeyRange[];
// 	readonly added: readonly TNodeKeyRange[];
// }

/**
 * @alpha
 */
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

/**
 * @alpha
 */
export interface FieldChangeEncoder<TChangeset> {
	/**
	 * Encodes `change` into a JSON compatible object.
	 */
	encodeChangeForJson(formatVersion: number, change: TChangeset): JsonCompatibleReadOnly;

	/**
	 * Decodes `change` from a JSON compatible object.
	 */
	decodeChangeJson(formatVersion: number, change: JsonCompatibleReadOnly): TChangeset;
}

// export interface FieldEditor<TChangeset> {
// 	/**
// 	 * Creates a changeset which represents the given `change` to the child at `childIndex` of this editor's field.
// 	 */
// 	buildChildChange(childIndex: number, change: NodeChangeset): TChangeset;
// }

/**
 * The `index` represents the index of the child node in the input context.
 * The `index` should be `undefined` iff the child node does not exist in the input context (e.g., an inserted node).
 * Returns `undefined` iff the child changes amount to nothing.
 * @alpha
 */
export type ToDelta = (
	child: NodeChangeset,
	index: number | undefined,
) => Delta.NodeChanges | undefined;

/**
 * @alpha
 */
export type NodeReviver = (
	revision: RevisionTag,
	index: number,
	count: number,
) => Delta.ProtoNode[];

/**
 * @alpha
 */
export type IdAllocator = () => ChangesetLocalId;

/**
 * An ID which is unique within a revision of a `ModularChangeset`.
 * A `ModularChangeset` which is a composition of multiple revisions may contain duplicate `ChangesetLocalId`s,
 * but they are unique when qualified by the revision of the change they are used in.
 * @alpha
 */
export type ChangesetLocalId = Brand<number, "ChangesetLocalId">;

/**
 * Changeset for a subtree rooted at a specific node.
 * @alpha
 */
export interface NodeChangeset {
	fieldChanges?: FieldChangeMap;
	valueChange?: ValueChange;
}

/**
 * @alpha
 */
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

/**
 * @alpha
 */
export interface ModularChangeset {
	/**
	 * The numerically highest `ChangesetLocalId` used in this changeset.
	 * If undefined then this changeset contains no IDs.
	 */
	maxId?: ChangesetLocalId;
	changes: FieldChangeMap;
}

/**
 * @alpha
 */
export type FieldChangeMap = Map<FieldKey, FieldChange>;

/**
 * @alpha
 */
export interface FieldChange {
	fieldKind: FieldKindIdentifier;
	/**
	 * If defined, `shallow` changes are part of the specified revision.
	 * Undefined in the following cases:
	 * A) A revision is specified on an ancestor of this `FieldChange`, in which case `shallow` changes
	 * are part of that revision.
	 * B) `shallow` changes are composed of multiple revisions.
	 * C) `shallow` changes are part of an anonymous revision.
	 */
	revision?: RevisionTag;
	shallow?: FieldChangeset;
	readonly nested?: FieldAnchorContainer<NodeChangeset>;
}

// export type TT = FieldChangeset ? true : false;
// const t: FieldChangeset = undefined;

export type FieldChangeset = Brand<unknown, "FieldChangeset">;

export type FieldNodeKey = Brand<unknown, "FieldNodeKey">;

export class Container<TData> {
	protected readonly data?: TData;

	/**
	 * This class should never exist at runtime, so make it un-constructable.
	 */
	private constructor() {}
}

export type FieldAnchorContainer<TData> = Brand<unknown, "NodeChangesetContainer"> &
	Container<TData>;

export function nestedChange<TAnchorSetOps extends AnchorSetOpsURIs>(
	fieldKind: FieldKind<unknown, TAnchorSetOps>,
	index: number,
	nodeChange: NodeChangeset,
): FieldChange {
	return {
		fieldKind: fieldKind.identifier,
		nested: anchorSetFromData(fieldKind.changeHandler.anchorSetOps, [
			{ key: fieldKind.changeHandler.getKey(index), data: nodeChange },
		]) as FieldAnchorContainer<NodeChangeset>,
	};
}
