/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta, TaggedChange } from "../../core";
import { brand, JsonCompatibleReadOnly } from "../../util";
import { FieldAnchorSetOps, MergeCallback } from "./anchorSetOps";
import { FieldChangeHandler } from "./fieldChangeHandler";
import { FieldKind, Multiplicity } from "./fieldKind";
import {
	sequenceFieldAnchorSetOps,
	SequenceKey,
	SequenceAnchorSetTypes,
	SequenceFieldAnchorSet,
} from "./sequenceShapedFieldAnchorSet";

/**
 * A field-agnostic set of empty changes to the elements of a field.
 */
export type EmptyChangeset = 0;

// URI for the NoChangeSequenceAnchorSet implementation
export const GenericAnchorSetURI = "GenericAnchorSetURI";
export type GenericAnchorSetURI = typeof GenericAnchorSetURI;

// Registers the types used by the generic anchor set.
declare module "./anchorSetOpsRegistry" {
	interface AnchorSetOpsRegistry<TData> {
		[GenericAnchorSetURI]: SequenceAnchorSetTypes<TData, EmptyChangeset>;
	}
}

export const genericAnchorSetOps: FieldAnchorSetOps<typeof GenericAnchorSetURI> = {
	rebase: () => {},
	composeWith,
	...sequenceFieldAnchorSetOps,
};

function composeWith<TData>(
	set: SequenceFieldAnchorSet<TData>,
	_: TaggedChange<EmptyChangeset> | undefined,
	laterSet: SequenceFieldAnchorSet<TData> | undefined,
	mergeData: MergeCallback<TData>,
): void {
	if (laterSet !== undefined) {
		sequenceFieldAnchorSetOps.mergeIn(set, laterSet, mergeData);
	}
}

/**
 * {@link FieldChangeHandler} implementation for {@link EmptyChangeset}.
 */
export const genericChangeHandler: FieldChangeHandler<
	GenericAnchorSetURI,
	unknown,
	EmptyChangeset,
	SequenceKey
> = {
	anchorSetOps: genericAnchorSetOps,
	rebaser: {
		compose: (): EmptyChangeset => 0,
		invert: (): EmptyChangeset => 0,
		rebase: (): EmptyChangeset => 0,
	},
	encoder: {
		encodeChangeForJson: (): JsonCompatibleReadOnly => 0,
		decodeChangeJson: (): EmptyChangeset => 0,
	},
	editor: {},
	intoDelta: (): Delta.MarkList => [],
};

/**
 * {@link FieldKind} used to represent changes to elements of a field in a field-kind-agnostic format.
 */
export const genericFieldKind = new FieldKind(
	brand("ModularEditBuilder.Generic"),
	Multiplicity.Sequence,
	genericChangeHandler,
	(types, other) => false,
	new Set(),
);
