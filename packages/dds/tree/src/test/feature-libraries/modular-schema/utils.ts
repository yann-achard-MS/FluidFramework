/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldChangeHandler,
	FieldKind,
	Multiplicity,
	FieldKinds,
	baseChangeHandlerKeyFunctions,
	noRebaseAnchorSetFactoryFactory,
	referenceFreeFieldChangeRebaser,
	BaseAnchorSet,
	BaseNodeKey,
	RebaseDirection,
} from "../../../feature-libraries";
import { Delta, makeAnonChange, TaggedChange } from "../../../core";
import { brand, JsonCompatibleReadOnly, makeArray } from "../../../util";
import { singleJsonCursor } from "../../../domains";

export type ValueChangeset = FieldKinds.ReplaceOp<number>;

export const valueHandler: FieldChangeHandler<ValueChangeset> = {
	...baseChangeHandlerKeyFunctions,
	anchorSetFactory: noRebaseAnchorSetFactoryFactory<ValueChangeset>(),
	rebaser: FieldKinds.replaceRebaser(),
	encoder: FieldKinds.valueEncoder<ValueChangeset & JsonCompatibleReadOnly>(),
	editor: {},
	intoDelta: (change): Delta.MarkList =>
		change === 0
			? []
			: // Using these Delta marks to represent the value replacement
			  [
					{ type: Delta.MarkType.Delete, count: 1 },
					{ type: Delta.MarkType.Insert, content: [singleJsonCursor(change.new)] },
			  ],
};

export const valueField = new FieldKind(
	brand("Value"),
	Multiplicity.Value,
	valueHandler,
	(a, b) => false,
	new Set(),
);

export interface AddDelChangeset {
	add: number;
	del: number;
}

export class AddDelAnchorSet<TData> extends BaseAnchorSet<TData, AddDelChangeset> {
	public static fromData<TData>(
		entries: readonly { readonly key: BaseNodeKey; readonly data: TData }[],
	): AddDelAnchorSet<TData> {
		const set = new AddDelAnchorSet<TData>();
		for (const { key, data } of entries) {
			set.track(key, data);
		}
		return set;
	}

	public clone(): AddDelAnchorSet<TData> {
		const set = new AddDelAnchorSet<TData>();
		set.mergeIn(this);
		return set;
	}

	public rebase(over: TaggedChange<AddDelChangeset>, direction: RebaseDirection): void {
		if (direction === RebaseDirection.Backward) {
			return this.rebase(
				makeAnonChange(addDelRebaser.invert(over.change)),
				RebaseDirection.Forward,
			);
		}
		// The keys only refer to nodes in the input context
		let iEntry = 0;
		const { del, add } = over.change;
		const net = add - del;
		while (iEntry < this.list.length && this.list[iEntry].key < del) {
			iEntry += 1;
		}
		this.list.splice(0, iEntry);
		for (const entry of this.list) {
			entry.key = brand(entry.key + net);
		}
	}
}

const addDelRebaser = {
	compose: (changes: AddDelChangeset[]): AddDelChangeset => {
		let add = 0;
		let del = 0;
		for (const change of changes) {
			const cancelledAdds = Math.min(add, change.del);
			add -= cancelledAdds;
			del += change.del - cancelledAdds;
			add += change.add;
		}
		return { add, del };
	},
	invert: (change: AddDelChangeset) => ({ add: change.del, del: change.add }),
	rebase: (change: AddDelChangeset, over: AddDelChangeset) => ({
		add: change.add,
		del: change.del - Math.min(change.del, over.del),
	}),
};

export const addDelHandler: FieldChangeHandler<AddDelChangeset> = {
	...baseChangeHandlerKeyFunctions,
	anchorSetFactory: <TData>() => new AddDelAnchorSet<TData>(),
	rebaser: referenceFreeFieldChangeRebaser(addDelRebaser),
	encoder: FieldKinds.valueEncoder<AddDelChangeset & JsonCompatibleReadOnly>(),
	editor: {},
	intoDelta: (change): Delta.MarkList => {
		const markList: Delta.Mark[] = [];
		if (change.del > 0) {
			markList.push({ type: Delta.MarkType.Delete, count: change.del });
		}
		if (change.add > 0) {
			markList.push({
				type: Delta.MarkType.Insert,
				content: makeArray(change.add, () => singleJsonCursor({})),
			});
		}
		return markList;
	},
};

export const addDelField = new FieldKind(
	brand("AddDel"),
	Multiplicity.Sequence,
	addDelHandler,
	(a, b) => false,
	new Set(),
);
