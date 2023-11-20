/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta, TaggedChange } from "../../../core";
import { FieldAnchorSetOps, MergeCallback } from "../anchorSetOps";
import { FieldChangeHandler } from "../fieldChangeHandler";
import { FieldKindWithEditor, Multiplicity } from "../fieldKind";
import {
	SequenceAnchorSetTypes,
	SequenceFieldAnchorSet,
	sequenceFieldAnchorSetOps,
} from "../sequenceShapedFieldAnchorSet";
import { makeGenericChangeCodec } from "./genericFieldKindCodecs";
import { GenericChangeset } from "./genericFieldKindTypes";

export const GenericAnchorSetURI = "GenericAnchorSetURI";
export type GenericAnchorSetURI = typeof GenericAnchorSetURI;

// Registers the types used by the generic anchor set.
declare module "../anchorSetOps/anchorSetOpsRegistry" {
	interface AnchorSetOpsRegistry<TData> {
		[GenericAnchorSetURI]: SequenceAnchorSetTypes<TData, GenericChangeset>;
	}
}

export const genericAnchorSetOps: FieldAnchorSetOps<typeof GenericAnchorSetURI> = {
	rebase: () => {},
	composeWith,
	...sequenceFieldAnchorSetOps,
	codecsFactory: sequenceFieldAnchorSetOps.codecsFactory as any,
};

function composeWith<TData>(
	set: SequenceFieldAnchorSet<TData>,
	_: TaggedChange<GenericChangeset> | undefined,
	laterSet: SequenceFieldAnchorSet<TData> | undefined,
	mergeData: MergeCallback<TData>,
): void {
	if (laterSet !== undefined) {
		sequenceFieldAnchorSetOps.mergeIn(set, laterSet, mergeData);
	}
}

/**
 * {@link FieldChangeHandler} implementation for {@link GenericChangeset}.
 */
export const genericChangeHandler: FieldChangeHandler<GenericAnchorSetURI, GenericChangeset> = {
	anchorSetOps: genericAnchorSetOps,
	rebaser: {
		compose: (): GenericChangeset => 0,
		amendCompose: (): GenericChangeset => 0,
		prune: (): GenericChangeset => 0,
		invert: (): GenericChangeset => 0,
		rebase: (): GenericChangeset => 0,
	},
	codecsFactory: makeGenericChangeCodec,
	editor: {},
	intoDelta: (): Delta.FieldChanges => ({}),
	isEmpty: () => true,
};

export type GenericFieldKind = FieldKindWithEditor<
	typeof genericChangeHandler.editor,
	Multiplicity.Sequence,
	"ModularEditBuilder.Generic",
	GenericAnchorSetURI
>;

/**
 * {@link FieldKind} used to represent changes to elements of a field in a field-kind-agnostic format.
 */
export const genericFieldKind: GenericFieldKind = new FieldKindWithEditor(
	"ModularEditBuilder.Generic",
	Multiplicity.Sequence,
	genericChangeHandler,
	() => false,
	new Set(),
);
