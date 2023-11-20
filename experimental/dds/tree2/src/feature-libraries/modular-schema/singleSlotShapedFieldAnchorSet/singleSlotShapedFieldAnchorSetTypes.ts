/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AnchorSetAspects, FieldAnchorSetEntry } from "../anchorSetOps";

/**
 * A child key for a single-slot-shaped field.
 */
export type SingleSlotKey = undefined;

/**
 * An entry in an anchor set for a single-slot-shaped field.
 */
export type SingleSlotAnchorEntry<TData> = FieldAnchorSetEntry<TData, SingleSlotKey>;

/**
 * A set of anchors for a single-slot-shaped field.
 */
export interface SingleSlotFieldAnchorSet<TData = unknown> {
	entry?: TData;
}

/**
 * Helper type function to describe the concrete aspect types of a {@link FieldAnchorSetOps} implementation
 * that relies on {@link singleSlotFieldAnchorSetOps}.
 */
export interface SingleSlotAnchorSetTypes<TData, TChange>
	extends AnchorSetAspects<SingleSlotFieldAnchorSet<TData>, SingleSlotKey, TChange> {}
