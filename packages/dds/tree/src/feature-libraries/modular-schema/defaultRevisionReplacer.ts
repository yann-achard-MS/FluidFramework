/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type {
	ChangeAtomId,
	ChangesetLocalId,
	RevisionReplacer,
	RevisionTag,
} from "../../core/index.js";
import { brand, type Mutable } from "../../util/index.js";

export class DefaultRevisionReplacer implements RevisionReplacer {
	private readonly rangeMap: ReadonlyMap<
		RevisionTag | undefined,
		{ readonly min: ChangesetLocalId; readonly max: ChangesetLocalId }
	>;

	public constructor(
		public readonly updatedRevision: RevisionTag,
		private readonly obsoleteRevisions: ReadonlyMap<RevisionTag | undefined, ChangesetLocalId>,
	) {
		const basisMap = new Map<
			RevisionTag | undefined,
			{ readonly min: ChangesetLocalId; readonly max: ChangesetLocalId }
		>();
		let basis = 0;
		for (const [revision, maxId] of this.obsoleteRevisions) {
			basisMap.set(revision, { min: brand(basis), max: brand(basis + maxId) });
			basis += maxId + 1;
		}
		this.rangeMap = basisMap;
	}

	public isObsolete(revision: RevisionTag | undefined): boolean {
		return this.obsoleteRevisions.has(revision);
	}

	public getUpdatedAtomId<T extends ChangeAtomId>(id: T, count: number = 1): T {
		assert(count >= 1, "Count must be at least 1");
		const range = this.rangeMap.get(id.revision);
		if (range === undefined) {
			return id;
		}
		const localId = range.min + id.localId;
		assert(
			localId + count - 1 <= range.max,
			"ID must be within the range for the obsolete revision",
		);
		const updated: Mutable<T> = { ...id, revision: this.updatedRevision, localId };
		return updated;
	}
}
