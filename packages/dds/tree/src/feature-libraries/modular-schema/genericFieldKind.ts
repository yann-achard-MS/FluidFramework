/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta, TaggedChange } from "../../core";
import { brand, fail, JsonCompatibleReadOnly } from "../../util";
import { FieldChangeHandler, NodeChangeset, ChildIndex, Context } from "./fieldChangeHandler";
import {
	FieldAnchorSet,
	FieldAnchorSetEntry,
	FieldKind,
	MergeCallback,
	Multiplicity,
	RebaseDirection,
} from "./fieldKind";

/**
 * A field-kind-agnostic change to a single node within a field.
 */
export interface GenericChange {
	/**
	 * Index within the field of the changed node.
	 */
	index: number;
	/**
	 * Change to the node.
	 */
	nodeChange: NodeChangeset;
}

/**
 * Encoded version of {@link GenericChange}
 */
export interface EncodedGenericChange {
	index: number;
	// TODO: this format needs more documentation (ideally in the form of more specific types).
	nodeChange: JsonCompatibleReadOnly;
}

/**
 * A field-agnostic set of changes to the elements of a field.
 */
export type GenericChangeset = 0;

/**
 * {@link FieldChangeHandler} implementation for {@link GenericChangeset}.
 */
export const genericChangeHandler: FieldChangeHandler<GenericChangeset> = {
	rebaser: {
		compose: (): GenericChangeset => {
			fail("Should never be composed");
		},
		invert: (): GenericChangeset => {
			fail("Should never be inverted");
		},
		rebase: (): GenericChangeset => {
			fail("Should never be rebased");
		},
	},
	encoder: {
		encodeChangeForJson: (): JsonCompatibleReadOnly => {
			fail("Should never be encoded");
		},
		decodeChangeJson: (): GenericChangeset => {
			fail("Should never be decoded");
		},
		encodeNodeKeyForJson: (formatVersion: number, key: number): JsonCompatibleReadOnly => key,
		decodeNodeKeyJson: (formatVersion: number, key: JsonCompatibleReadOnly): number =>
			key as number,
	},
	editor: {},
	getKey: (index: number): number => index,
	rebaseKey: () => {
		fail("Should never be rebased");
	},
	prebaseKey: () => {
		fail("Should never be rebased");
	},
	keyToDeltaKey: (key: number): ChildIndex | undefined => ({
		context: Context.Input,
		index: key,
	}),
	intoDelta: (): Delta.MarkList => {
		fail("Should never be converted to a delta");
	},
};

export class GenericAnchorSet<TData>
	implements FieldAnchorSet<TData, number, number, GenericChangeset>
{
	clone(): FieldAnchorSet<TData, number, number, 0> {
		throw new Error("Method not implemented.");
	}
	mergeIn(set: FieldAnchorSet<TData, number, number, 0>, mergeData: MergeCallback<0>): void {
		throw new Error("Method not implemented.");
	}
	track(key: TData, data: 0, mergeData: MergeCallback<0>): number {
		throw new Error("Method not implemented.");
	}
	forget(anchor: number): void {
		throw new Error("Method not implemented.");
	}
	lookup(key: TData): FieldAnchorSetEntry<0, TData, number> | undefined {
		throw new Error("Method not implemented.");
	}
	locate(anchor: number): TData | undefined {
		throw new Error("Method not implemented.");
	}
	getData(anchor: number): 0 {
		throw new Error("Method not implemented.");
	}
	rebase(over: TaggedChange<number>, direction: RebaseDirection): void {
		throw new Error("Method not implemented.");
	}
	entries(): IterableIterator<FieldAnchorSetEntry<0, TData, number>> {
		throw new Error("Method not implemented.");
	}
}

const anchorStoreFactory = <TData>(): GenericAnchorSet<TData> => {
	return new GenericAnchorSet<TData>();
};

/**
 * {@link FieldKind} used to represent changes to elements of a field in a field-kind-agnostic format.
 */
export const genericFieldKind: FieldKind<GenericChangeset, number, number> = new FieldKind(
	brand("ModularEditBuilder.Generic"),
	Multiplicity.Sequence,
	anchorStoreFactory,
	genericChangeHandler,
	(types, other) => false,
	new Set(),
);
