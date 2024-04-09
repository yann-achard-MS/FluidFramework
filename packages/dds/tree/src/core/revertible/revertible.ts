/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Allows reversion of a change made to SharedTree.
 *
 * @remarks
 * Applications wanting to implement undo/redo support might typically maintain two stacks of Revertibles, with optional eviction policy to free up memory.
 *
 * @public
 */
export interface Revertible {
	/**
	 * The current status of the revertible.
	 */
	readonly status: RevertibleStatus;
	/**
	 * Reverts the associated change.
	 * @param release - If true, the revertible will be released after being reverted.
	 * If false, the revertible will remain valid. This can be useful for scenarios where the revert may be dropped
	 * due to merge conflicts, and one wants to attempt reverting again.
	 */
	revert(release: boolean): void;
	/**
	 * Releases this revertible so that it can no longer be used.
	 */
	release(): void;
}

/**
 * The status of a {@link Revertible}.
 *
 * @public
 */
export enum RevertibleStatus {
	/** The revertible can be reverted. */
	Valid,
	/** The revertible has been disposed. Reverting it will have no effect. */
	Disposed,
}
