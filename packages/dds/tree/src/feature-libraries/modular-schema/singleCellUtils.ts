/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { TaggedChange } from "../../core";
import { Brand, brand, fail, JsonCompatibleReadOnly, Mutable } from "../../util";
import {
	FieldAnchorSet,
	FieldAnchorSetEntry,
	MapCallback,
	MergeCallback,
	RebaseDirection,
	UpdateCallback,
} from "./anchorSet";
import {
	FieldChangeEncoder,
	DataEncoder,
	DataDecoder,
	ChildIndex,
	Context,
} from "./fieldChangeHandler";

/**
 * @alpha
 */
export interface SingleCellChangeCodec<
	TChangeset,
	TAnchorSet extends FieldAnchorSet<any, TChangeset, unknown>,
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

export type SingleCellEntry<TData> = FieldAnchorSetEntry<TData, SingleCellKey>;
export type SingleCellEncodedEntry = FieldAnchorSetEntry<JsonCompatibleReadOnly, SingleCellKey>;

/**
 * @alpha
 */
export class SingleCellAnchorSet<TData, TChangeset>
	implements FieldAnchorSet<SingleCellKey, TChangeset, TData>
{
	// TODO: the changeset should be able to represent changes to both the subtree present before
	// the change and the subtree present after the change (any changes in between).
	private entry?: Mutable<SingleCellEntry<TData>>;

	public static fromData<TData>(data: TData): SingleCellAnchorSet<TData, never> {
		const set = new SingleCellAnchorSet<TData, never>();
		set.add(brand(0), data, () => fail("Unexpected merge on empty set"));
		return set;
	}

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
		set.mergeIn(this);
		return set;
	}

	public count(): number {
		return this.entry === undefined ? 0 : 1;
	}

	public updateAll(func: UpdateCallback<TData, SingleCellKey>): void {
		if (this.entry !== undefined) {
			this.entry.data = func(this.entry.data, this.entry.key);
		}
	}

	public map<TOut>(func: MapCallback<TData, TOut>): SingleCellAnchorSet<TOut, TChangeset> {
		const set = this.clone() as SingleCellAnchorSet<TData | TOut, TChangeset>;
		set.updateAll(func as MapCallback<TData | TOut, TOut>);
		return set as SingleCellAnchorSet<TOut, TChangeset>;
	}

	public mergeIn(
		set: SingleCellAnchorSet<TData, TChangeset>,
		mergeData?: MergeCallback<TData>,
	): void {
		for (const { key, data } of set.entries()) {
			this.add(key, data, mergeData);
		}
	}

	public track(key: SingleCellKey, data: TData, mergeData?: MergeCallback<TData>): void {
		this.add(key, data, mergeData);
	}

	private add(key: SingleCellKey, data: TData, mergeData?: MergeCallback<TData>): void {
		if (this.entry === undefined) {
			this.entry = { key, data };
		} else {
			assert(mergeData !== undefined, "No data merging delegate provided");
			this.entry.data = mergeData(this.entry.data, data);
		}
	}

	public forget(key: SingleCellKey): void {
		assert(this.entry?.key === key, "Cannot forget unknown key");
		this.entry = undefined;
	}

	public lookup(key: SingleCellKey): SingleCellEntry<TData> | undefined {
		if (this.entry === undefined) {
			return undefined;
		}
		assert(this.entry.key === key, "TODO: deal with more complex keys");
		return this.entry;
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
