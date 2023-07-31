/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ObjectOptions, TSchema, Type } from "@sinclair/typebox";
import { ITreeCursorSynchronous, JsonableTree, RevisionTag, RevisionTagSchema } from "../../core";
import {
	ChangeAtomId,
	ChangesetLocalId,
	ChangesetLocalIdSchema,
	EncodedChangeAtomId,
	NodeChangeset,
} from "../modular-schema";

// TODO:AB#4259 Decouple types used for sequence-field's in-memory representation from their encoded variants.
// Currently, types in this file are largely used for both.
// See for example `Revive` whose type uses ITreeCursorSynchronous,
// but the schema for the serialized type uses ProtoNode (which is the result of serializing that cursor).

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

/**
 * The contents of a node to be created
 */
export type ProtoNode = JsonableTree;
export const ProtoNode = Type.Any();

export type CellCount = number;
export const CellCount = Type.Number();

/**
 * Left undefined for terseness.
 */
export const NoopMarkType = undefined;

/**
 * A monotonically increasing positive integer assigned to an individual mark within the changeset.
 * MoveIds are scoped to a single changeset, so referring to MoveIds across changesets requires
 * qualifying them by change tag.
 *
 * The uniqueness of IDs is leveraged to uniquely identify the matching move-out for a move-in/return and vice-versa.
 */
export type MoveId = ChangesetLocalId;
export const MoveId = ChangesetLocalIdSchema;

export interface HasMoveId {
	/**
	 * The sequential ID assigned to a change within a transaction.
	 */
	id: MoveId;
}
export const HasMoveId = Type.Object({ id: MoveId });

export type NodeChangeType = NodeChangeset;

// Boolean encodings can use this alternative to save space for frequently false values.
const OptionalTrue = Type.Optional(Type.Literal(true));

/**
 * Represents a position within a contiguous range of nodes detached by a single changeset.
 * Note that `LineageEvent`s with the same revision are not necessarily referring to the same detach.
 * `LineageEvent`s for a given revision can only be meaningfully compared if it is known that they must refer to the
 * same detach.
 * @alpha
 */
export interface LineageEvent {
	readonly revision: RevisionTag;
	readonly id: ChangesetLocalId;
	readonly count: number;

	/**
	 * The position of this mark within a range of nodes which were detached in this revision.
	 */
	readonly offset: number;
}
export const LineageEvent = Type.Object(
	{
		revision: Type.Readonly(RevisionTagSchema),
		id: Type.Readonly(ChangesetLocalIdSchema),
		count: Type.Readonly(Type.Number()),
		offset: Type.Readonly(Type.Number()),
	},
	noAdditionalProps,
);

/**
 * @alpha
 */
export interface HasLineage {
	/**
	 * History of detaches adjacent to the cells described by this `ChangeAtomId`.
	 */
	lineage?: LineageEvent[];
}

export const HasLineage = Type.Object({ lineage: Type.Optional(Type.Array(LineageEvent)) });

/**
 * @alpha
 */
export interface CellId extends ChangeAtomId, HasLineage {}

export const CellId = Type.Composite([EncodedChangeAtomId, HasLineage]);

export interface HasReattachFields {
	/**
	 * The revision this mark is inverting a detach from.
	 * If defined this mark is a revert-only inverse,
	 * meaning that it will only reattach nodes if those nodes were last detached by `inverseOf`.
	 * If `inverseOf` is undefined, this mark will reattach nodes regardless of when they were last detached.
	 */
	inverseOf?: RevisionTag;
}
export const HasReattachFields = Type.Object({
	inverseOf: Type.Optional(RevisionTagSchema),
});

export interface HasRevisionTag {
	/**
	 * The revision this mark is part of.
	 * Only set for marks in fields which are a composition of multiple revisions.
	 */
	revision?: RevisionTag;
}
export const HasRevisionTag = Type.Object({ revision: Type.Optional(RevisionTagSchema) });

export interface Transient {
	/**
	 * The details of the change that deletes the transient content.
	 */
	transientDetach: ChangeAtomId;
}
export const Transient = Type.Object({ detachedBy: EncodedChangeAtomId });

export type CanBeTransient = Partial<Transient>;
export const CanBeTransient = Type.Partial(Transient);

export interface Insert extends HasRevisionTag, CanBeTransient {
	type: "Insert";
	content: ProtoNode[];
}
export const Insert = Type.Composite(
	[
		HasRevisionTag,
		CanBeTransient,
		Type.Object({
			type: Type.Literal("Insert"),
			content: Type.Array(ProtoNode),
		}),
	],
	noAdditionalProps,
);

export interface MoveIn extends HasMoveId, HasRevisionTag {
	type: "MoveIn";
	/**
	 * When true, the corresponding MoveOut has a conflict.
	 * This is independent of whether this mark has a conflict.
	 */
	isSrcConflicted?: true;
}

export const MoveIn = Type.Composite(
	[
		HasMoveId,
		HasRevisionTag,
		Type.Object({
			type: Type.Literal("MoveIn"),
			isSrcConflicted: OptionalTrue,
		}),
	],
	noAdditionalProps,
);

export interface Delete extends HasRevisionTag {
	type: "Delete";
	id: ChangesetLocalId;
}

export const Delete = Type.Composite(
	[
		HasRevisionTag,
		Type.Object({
			type: Type.Literal("Delete"),
			id: ChangesetLocalIdSchema,
		}),
	],
	noAdditionalProps,
);

export interface MoveOut extends HasRevisionTag, HasMoveId {
	type: "MoveOut";
}
export const MoveOut = Type.Composite(
	[
		HasRevisionTag,
		HasMoveId,
		Type.Object({
			type: Type.Literal("MoveOut"),
		}),
	],
	noAdditionalProps,
);

export interface Revive extends HasReattachFields, HasRevisionTag, CanBeTransient {
	type: "Revive";
	content: ITreeCursorSynchronous[];
}
export const Revive = Type.Composite(
	[
		HasReattachFields,
		HasRevisionTag,
		CanBeTransient,
		Type.Object({
			type: Type.Literal("Revive"),
			content: Type.Array(ProtoNode),
		}),
	],
	noAdditionalProps,
);

export interface ReturnTo extends HasReattachFields, HasRevisionTag, HasMoveId {
	type: "ReturnTo";

	/**
	 * When true, the corresponding ReturnFrom has a conflict.
	 * This is independent of whether this mark has a conflict.
	 */
	isSrcConflicted?: true;
}
export const ReturnTo = Type.Composite(
	[
		HasReattachFields,
		HasRevisionTag,
		HasMoveId,
		Type.Object({
			type: Type.Literal("ReturnTo"),
			isSrcConflicted: OptionalTrue,
		}),
	],
	noAdditionalProps,
);

export interface ReturnFrom extends HasRevisionTag, HasMoveId {
	type: "ReturnFrom";

	/**
	 * When true, the corresponding ReturnTo has a conflict.
	 * This is independent of whether this mark has a conflict.
	 */
	isDstConflicted?: true;
}
export const ReturnFrom = Type.Composite(
	[
		HasRevisionTag,
		HasMoveId,
		Type.Object({
			type: Type.Literal("ReturnFrom"),
			isDstConflicted: OptionalTrue,
		}),
	],
	noAdditionalProps,
);

export type NewAttach = Insert | MoveIn;
export const NewAttach = Type.Union([Insert, MoveIn]);

export type Reattach = Revive | ReturnTo;
export const Reattach = Type.Union([Revive, ReturnTo]);

export type Attach = NewAttach | Reattach;
export const Attach = Type.Union([NewAttach, Reattach]);

export type Detach = Delete | MoveOut | ReturnFrom;
export const Detach = Type.Union([Delete, MoveOut, ReturnFrom]);

/**
 * Mark used during compose to temporarily remember the position of nodes which were being moved
 * but had their move cancelled with an inverse.
 * This mark should only exist as part of intermediate output of compose and should be removed during the amendCompose pass.
 */
export interface MovePlaceholder extends HasRevisionTag, HasMoveId {
	type: "Placeholder";
}

export type Effect = MovePlaceholder | Attach | Detach;
export const Effect = Type.Union([Attach, Detach]);

export interface Mark<TNodeChange> {
	count: CellCount;
	/**
	 * Describes the detach which last emptied the target cells,
	 * or the attach which allocated the cells if the cells have never been filled.
	 * Undefined if the target cells are not empty in this mark's input context.
	 */
	cellId?: CellId;
	/**
	 * The effects to be applied to the target cells or the nodes within them.
	 * Undefined if no effect is to be applied the the cells.
	 * Empty is equivalent to undefined, with empty being preferred for terseness.
	 */
	effects?: Effect[];
	/**
	 * Nested changes to the node that exists or existed in the cell.
	 * Nested changes are always represented in the mark that that corresponds to the cell that contains
	 * (or last contained, in situations where the node has been removed)
	 * the affected node in the input context. This means that if a node is moved, the nested changes
	 * will be represented at the location of the cell the node was moved from.
	 */
	changes?: TNodeChange;
}

export const Mark = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Object(
		{
			count: CellCount,
			cellId: Type.Optional(CellId),
			effects: Type.Optional(Type.Array(Effect)),
			changes: Type.Optional(tNodeChange),
		},
		noAdditionalProps,
	);

export type MarkList<TNodeChange = NodeChangeType> = Mark<TNodeChange>[];

export type Changeset<TNodeChange = NodeChangeType> = MarkList<TNodeChange>;
export const Changeset = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Array(Mark(tNodeChange));
