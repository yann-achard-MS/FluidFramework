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
import {
	brand,
	brandConst,
	newTupleBTree,
	type IdAllocator,
	type Mutable,
} from "../../util/index.js";
import {
	getFromChangeAtomIdMap,
	setInChangeAtomIdMap,
	type ChangeAtomIdBTree,
} from "../changeAtomIdBTree.js";

export class DefaultRevisionReplacer
	implements RevisionReplacer, IdAllocator<ChangesetLocalId>
{
	/**
	 * Mapping from (obsolete revision tag, original local id) to the updated local id.
	 */
	private readonly updatedLocalIds: ChangeAtomIdBTree<ChangesetLocalId> = newTupleBTree();
	/**
	 * The maximum local ID seen so far in the scope of the updated revision.
	 * All allocated IDs will be greater than this value.
	 */
	private maxSeen: ChangesetLocalId = brandConst(-1)();

	public constructor(
		public readonly updatedRevision: RevisionTag,
		private readonly obsoleteRevisions: Set<RevisionTag | undefined>,
	) {}

	public allocate(count: number = 1): ChangesetLocalId {
		const id: ChangesetLocalId = brand(this.maxSeen + 1);
		this.maxSeen = brand(this.maxSeen + count);
		return id;
	}

	public getMaxId(): ChangesetLocalId {
		return this.maxSeen;
	}

	public bumpMaxId(newId: ChangesetLocalId): void {
		assert(newId >= this.maxSeen, "Cannot bump max ID to a smaller value");
		this.maxSeen = newId;
	}

	public isObsolete(revision: RevisionTag | undefined): boolean {
		return this.obsoleteRevisions.has(revision);
	}

	public getUpdatedAtomId<T extends ChangeAtomId>(id: T): T {
		if (this.isObsolete(id.revision)) {
			const updated: Mutable<T> = { ...id, revision: this.updatedRevision };
			const prior: ChangesetLocalId | undefined = getFromChangeAtomIdMap(
				this.updatedLocalIds,
				id,
			);
			if (prior !== undefined) {
				updated.localId = prior;
			} else {
				let localId: ChangesetLocalId;
				if (id.localId <= this.maxSeen) {
					this.maxSeen = brand(this.maxSeen + 1);
					localId = this.maxSeen;
				} else {
					// This change atom ID uses a local ID that has not yet been used in the scope of the updated revision.
					// We reuse it as is to minimize the number of IDs that need to be updated.
					localId = id.localId;
					this.maxSeen = localId;
				}
				setInChangeAtomIdMap(this.updatedLocalIds, id, localId);
				updated.localId = localId;
			}
			return updated;
		}
		return id;
	}
}
