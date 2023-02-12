/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta } from "../../core";
import { brand, JsonCompatibleReadOnly } from "../../util";
import { FieldAnchorSetOps } from "./anchorSet";
import { FieldChangeHandler, ChildIndex, Context } from "./fieldChangeHandler";
import { FieldKind, Multiplicity } from "./fieldKind";
import {
	sequenceFieldAnchorSetOps,
	SequenceKey,
	SequenceAnchorSetTypes,
} from "./sequenceShapedFieldAnchorSet";

export const defaultKeyFunctions = {
	getKey: (index: number): SequenceKey => brand(index),
	keyToDeltaKey: (key: SequenceKey): ChildIndex | undefined => ({
		context: Context.Input,
		index: key,
	}),
};

/**
 * A field-agnostic set of empty changes to the elements of a field.
 */
export type EmptyChangeset = 0;

// URI for the NoChangeSequenceAnchorSet implementation
export const GenericAnchorSetURI = "GenericAnchorSetURI";
export type GenericAnchorSetURI = typeof GenericAnchorSetURI;

// Registers the types used by the generic anchor set.
declare module "./anchorSet" {
	interface AnchorSetOpRegistry<TData> {
		[GenericAnchorSetURI]: SequenceAnchorSetTypes<TData, EmptyChangeset>;
	}
}

export const genericAnchorSetOps: FieldAnchorSetOps<typeof GenericAnchorSetURI> = {
	rebase: () => {},
	...sequenceFieldAnchorSetOps,
};

/**
 * {@link FieldChangeHandler} implementation for {@link EmptyChangeset}.
 */
export const genericChangeHandler: FieldChangeHandler<
	GenericAnchorSetURI,
	unknown,
	EmptyChangeset,
	SequenceKey
> = {
	...defaultKeyFunctions,
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
