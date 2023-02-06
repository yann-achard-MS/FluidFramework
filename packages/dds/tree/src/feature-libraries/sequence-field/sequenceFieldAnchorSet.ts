/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../util";
import { TaggedChange } from "../../core";
import { BaseAnchorSet, RebaseDirection } from "../modular-schema";
import { Changeset } from "./format";

export class SequenceAnchorSet<TData = unknown> extends BaseAnchorSet<TData, Changeset> {
	public clone(): SequenceAnchorSet<TData> {
		const set = new SequenceAnchorSet<TData>();
		set.mergeIn(this, () => fail("Unexpected merge in empty anchor set"));
		return set;
	}

	public rebase(over: TaggedChange<Changeset>, direction: RebaseDirection): void {
		// Nothing to rebase over
	}
}

export const anchorSetFactory = <TData>(): SequenceAnchorSet<TData> => {
	return new SequenceAnchorSet<TData>();
};
