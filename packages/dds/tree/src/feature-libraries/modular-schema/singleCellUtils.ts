/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { TaggedChange } from "../../core";
import { Brand, brand, fail, JsonCompatibleReadOnly, Mutable } from "../../util";
import {
	FieldChangeEncoder,
	FieldAnchorSet,
	FieldAnchorSetEntry,
	MergeCallback,
	RebaseDirection,
	DataDecoder,
	DataEncoder,
	ChildIndex,
	Context,
} from ".";

/**
 * @alpha
 */
export interface SingleCellChangeCodec<
	TChangeset,
	TAnchorSet extends FieldAnchorSet<any, any, TChangeset, unknown>,
> {
	encodeChangeForJson: FieldChangeEncoder<TChangeset, TAnchorSet>["encodeChangeForJson"];
	decodeChangeJson: FieldChangeEncoder<TChangeset, TAnchorSet>["decodeChangeJson"];
}

/**
 * @alpha
 */
export function singleCellFieldEncoder<TChangeset>(
	changeCodec: SingleCellChangeCodec<TChangeset, SingleCellAnchorSet<unknown, TChangeset>>,
): FieldChangeEncoder<TChangeset, SingleCellAnchorSet<unknown, TChangeset>> {
	return {
		...changeCodec,
		encodeAnchorSetForJson: <TData>(
			formatVersion: number,
			set: SingleCellAnchorSet<TData, TChangeset>,
			dataEncoder: DataEncoder<TData>,
		): JsonCompatibleReadOnly => {
			return set.encodeForJson(formatVersion, dataEncoder);
		},

		decodeAnchorSetJson: <TData>(
			formatVersion: number,
			set: JsonCompatibleReadOnly,
			dataDecoder: DataDecoder<TData>,
		): SingleCellAnchorSet<TData, TChangeset> => {
			return SingleCellAnchorSet.decodeJson<TData, TChangeset>(
				formatVersion,
				set,
				dataDecoder,
			);
		},
	};
}

export type SingleCellKey = Brand<number, "SingleCellKey">;
export type SingleCellAnchor = Brand<number, "SingleCellAnchor">;

export type SingleCellEntry<TData> = FieldAnchorSetEntry<TData, SingleCellKey, SingleCellAnchor>;
export type SingleCellEncodedEntry = FieldAnchorSetEntry<
	JsonCompatibleReadOnly,
	SingleCellKey,
	SingleCellAnchor
>;

/**
 * @alpha
 */
export class SingleCellAnchorSet<TData, TChangeset>
	implements FieldAnchorSet<SingleCellKey, SingleCellAnchor, TChangeset, TData>
{
	// TODO: the changeset should be able to represent changes to both the subtree present before
	// the change and the subtree present after the change (any changes in between).
	private entry?: Mutable<SingleCellEntry<TData>>;

	public encodeForJson(
		formatVersion: number,
		dataEncoder: DataEncoder<TData>,
	): JsonCompatibleReadOnly {
		if (this.entry === undefined) {
			return {};
		}
		return { entry: { ...this.entry, data: dataEncoder(this.entry.data) } };
	}

	public static decodeJson<TData, TChangeset>(
		formatVersion: number,
		set: JsonCompatibleReadOnly,
		dataDecoder: DataDecoder<TData>,
	): SingleCellAnchorSet<TData, TChangeset> {
		const newSet = new SingleCellAnchorSet<TData, TChangeset>();
		const encodedSet = set as { entry?: SingleCellEncodedEntry };
		if (encodedSet.entry !== undefined) {
			newSet.entry = { ...encodedSet.entry, data: dataDecoder(encodedSet.entry.data) };
		}
		return newSet;
	}

	public clone(): SingleCellAnchorSet<TData, TChangeset> {
		const set = new SingleCellAnchorSet<TData, TChangeset>();
		set.mergeIn(this, () => fail("Unexpected merge in empty anchor set"));
		return set;
	}

	public mergeIn(
		set: SingleCellAnchorSet<TData, TChangeset>,
		mergeData: MergeCallback<TData>,
	): void {
		for (const { key, anchor, data } of set.entries()) {
			this.add(key, data, mergeData, anchor);
		}
	}

	public track(
		key: SingleCellKey,
		data: TData,
		mergeData: MergeCallback<TData>,
	): SingleCellAnchor {
		return this.add(key, data, mergeData);
	}

	private add(
		key: SingleCellKey,
		data: TData,
		mergeData: MergeCallback<TData>,
		existingAnchor?: SingleCellAnchor,
	): SingleCellAnchor {
		if (this.entry === undefined) {
			const anchor: SingleCellAnchor = existingAnchor ?? brand(0);
			this.entry = { key, anchor, data };
			return anchor;
		} else {
			this.entry.data = mergeData(this.entry.data, data);
			return this.entry.anchor;
		}
	}

	public forget(anchor: SingleCellAnchor): void {
		assert(this.entry?.anchor === anchor, "Cannot forget unknown anchor");
		this.entry = undefined;
	}

	public lookup(key: SingleCellKey): SingleCellEntry<TData> | undefined {
		throw new Error("Method not implemented.");
	}

	public locate(anchor: SingleCellAnchor): SingleCellEntry<TData> {
		throw new Error("Method not implemented.");
	}

	public getData(anchor: SingleCellAnchor): TData {
		throw new Error("Method not implemented.");
	}

	public rebase(over: TaggedChange<TChangeset>, direction: RebaseDirection): void {
		// Nothing to rebase over
	}

	public entries(): IterableIterator<SingleCellEntry<TData>> {
		return (this.entry === undefined ? [] : [this.entry]).values();
	}
}

/**
 * @alpha
 */
export const singleCellAnchorSetFactory = <TData, TChangeset>(): SingleCellAnchorSet<
	TData,
	TChangeset
> => {
	return new SingleCellAnchorSet<TData, TChangeset>();
};

/**
 * @alpha
 */
export const singleCellKeyFunctions = {
	getKey: (index: number): SingleCellKey => brand(0),
	keyToDeltaKey: (key: SingleCellKey): ChildIndex | undefined => ({
		context: Context.Input,
		index: 0,
	}),
};
